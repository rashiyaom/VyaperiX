import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services import chat_service as chat, rag_engine
from app.services.extraction_validator import evidence_record


def report(identity="alpha"):
    return {"id": identity, "input_urls": {"website": f"https://{identity}.example", "files": ["catalog.pdf"]}}


def chunk(identity="alpha", text="Our showroom is located in River City."):
    return {"report_id": identity, "chunk_id": identity + "-one", "text": text,
            "source": "catalog.pdf", "source_type": "document", "url": "", "chat_allowed": True,
            "extraction_version": 3, "relevance": .85, "retrieval_method": "vector",
            "evidence": [evidence_record("", text, "uploaded_document", "upload:catalog.pdf")]}


def candidate(c):
    return {"answer": c["text"], "confidence": "exact", "sources": [c["chunk_id"]], "evidence": c["text"]}


class ReportChatTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        chat._answers.clear()
        self.own = chunk()
        self.patches = [
            patch.object(chat.db, "get_chat_answer", new=AsyncMock(return_value=None)),
            patch.object(chat.db, "save_chat_answer", new=AsyncMock(side_effect=lambda key, report_id, answer: answer)),
            patch.object(chat.db, "get_report_chunks", new=AsyncMock(return_value=[self.own])),
            patch.object(rag_engine, "PINECONE_API_KEY", "test"),
            patch.object(rag_engine, "retrieve_chunks", new=AsyncMock(return_value=[self.own])),
            patch.object(chat, "_generate_answer", return_value=candidate(self.own)),
            patch.object(chat, "_verify_answer", return_value={"supported": True, "relevant": True, "direct": True}),
        ]
        self.mocks = [p.start() for p in self.patches]
        self.addCleanup(lambda: [p.stop() for p in reversed(self.patches)])

    async def test_exact_quotes_and_report_filter_requested(self):
        result = await chat.answer_report_question(report(), "Where is the showroom?")
        self.assertEqual(result["confidence"], "exact")
        self.assertIn("River City", result["answer"])
        self.assertEqual(result["sources"], ["alpha-one"])
        self.assertTrue(self.mocks[4].await_args.kwargs["chat_only"])

    async def test_low_similarity_direct_evidence_not_downgraded(self):
        self.mocks[4].return_value = [{**self.own, "relevance": .64}]
        result = await chat.answer_report_question(report(), "Where is the showroom?")
        self.assertEqual(result["confidence"], "exact")

    async def test_inference_label_also_in_text(self):
        self.mocks[5].return_value = {**candidate(self.own), "confidence": "inferred"}
        result = await chat.answer_report_question(report(), "Could I visit the showroom?")
        self.assertEqual(result["confidence"], "inferred")
        self.assertIn("do not state this directly", result["answer"])

    async def test_unrelated_below_threshold_skips_generation(self):
        self.mocks[4].return_value = [{**self.own, "relevance": .1}]
        result = await chat.answer_report_question(report(), "Predict tomorrow weather in Tokyo")
        self.assertEqual(result["confidence"], "not_found")
        self.mocks[5].assert_not_called()

    async def test_legacy_data_requires_refresh(self):
        self.mocks[2].return_value = [{**self.own, "extraction_version": 2}]
        result = await chat.answer_report_question(report(), "Where is the showroom?")
        self.assertEqual(result["reason"], "sources_need_refresh")
        self.mocks[4].assert_not_awaited()

    async def test_vector_outage_uses_canonical_chunks(self):
        self.mocks[4].side_effect = rag_engine.RAGRetrieveError("offline")
        result = await chat.answer_report_question(report(), "Where is the showroom?")
        self.assertEqual(result["confidence"], "exact")
        self.assertIsNone(result["citations"][0]["score"])

    async def test_explicit_outside_url_skips_retrieval(self):
        result = await chat.answer_report_question(report(), "Where is https://beta.example located?")
        self.assertEqual(result["reason"], "outside_report")
        self.mocks[4].assert_not_awaited()

    async def test_concurrent_reports_and_same_filename_do_not_mix(self):
        second = chunk("beta", "Our showroom is located in Mountain City.")
        self.mocks[2].side_effect = lambda report_id: [self.own, second]  # adversarial storage response
        self.mocks[4].return_value = [second, self.own]  # adversarial vector provider response
        contexts = []
        def generate(question, context, url, tier):
            contexts.append((url, context))
            return candidate(second if "beta" in url else self.own)
        self.mocks[5].side_effect = generate
        results = await asyncio.gather(*(chat.answer_report_question(report(identity), "Where is the showroom?")
                                         for identity in ["alpha", "beta"] * 8))
        self.assertEqual(len(contexts), 2)
        for url, context in contexts:
            self.assertNotIn("Mountain City" if "alpha" in url else "River City", context)
        for i, result in enumerate(results):
            self.assertEqual(result["sources"], ["alpha-one" if i % 2 == 0 else "beta-one"])

    async def test_cached_retries_identical_and_corpus_change_invalidates(self):
        first = await chat.answer_report_question(report(), "Where is the showroom?")
        self.mocks[5].return_value = {"confidence": "not_found"}
        self.assertEqual(first, await chat.answer_report_question(report(), "Where is the showroom?"))
        self.assertEqual(self.mocks[5].call_count, 1)
        self.mocks[2].return_value = [{**self.own, "text": "Our showroom moved to Hill City."}]
        result = await chat.answer_report_question(report(), "Where is the showroom?")
        self.assertEqual(result["confidence"], "not_found")
        self.assertEqual(self.mocks[5].call_count, 2)

    async def test_bad_format_retries_without_false_refusal(self):
        self.mocks[5].side_effect = [ValueError("partial"), candidate(self.own)]
        result = await chat.answer_report_question(report(), "Where is the showroom?")
        self.assertEqual(result["confidence"], "exact")
        self.assertEqual(self.mocks[5].call_count, 2)

    async def test_invalid_candidate_is_logged_and_error_not_source_miss(self):
        self.mocks[5].return_value = {**candidate(self.own), "answer": "There are 900 offices."}
        with self.assertLogs(chat.logger, level="WARNING") as logs:
            result = await chat.answer_report_question(report(), "How many offices?")
        self.assertEqual(result["confidence"], "not_found")
        self.assertEqual(result["reason"], "evidence_insufficient")
        self.assertIn("unsupported_number", " ".join(logs.output))
        self.mocks[1].assert_awaited_once()

    async def test_vague_question_requests_clarification(self):
        result = await chat.answer_report_question(report(), "How much is it?")
        self.assertEqual(result["reason"], "clarification_needed")
        self.mocks[5].assert_not_called()


if __name__ == "__main__":
    unittest.main()
