import sys
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services import extraction_validator as extraction, crawl_coverage as coverage, confidence_scorer as scorer, rag_engine


class ExtractionTests(unittest.TestCase):
    def test_scripts_hidden_ads_and_isolated_digits_are_not_facts(self):
        result = extraction.extract_evidence('''<html><head><script>let phone="3997.433.9763";let price="$999";</script></head>
        <body><div hidden>Secret phone 1234567890</div><div class="advertisement">Price $900</div>
        <div style="display:none">Fake founder Alice</div><p>9876543210</p>
        <h2>Contact</h2><p>Visit our showroom at 12 River Road.</p><a href="tel:+123456789">Call us</a></body></html>''', 'https://a.test')
        for forbidden in ['3997', '999', 'Secret', '900', 'Alice', '9876543210']:
            self.assertNotIn(forbidden, result['text'])
        self.assertIn('12 River Road', result['text'])
        self.assertIn('Phone: +123456789', result['text'])
        self.assertTrue(all(extraction.is_trusted(e) for e in result['evidence']))

    def test_jsonld_graph_meta_and_malformed_json(self):
        result = extraction.extract_evidence('''<meta content="Company information" name="description">
        <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Example","address":{"streetAddress":"River Road"}}]}</script>
        <script type="application/ld+json">{"@type":"Thing","name":"Untrusted app state"}</script>
        <script type="application/ld+json">{broken</script>''', 'https://a.test')
        self.assertIn('River Road', result['text'])
        self.assertIn('Company information', result['text'])
        self.assertNotIn('Untrusted app state', result['text'])

    def test_price_cards_and_table_labels_stay_together(self):
        result = extraction.extract_evidence('''<section><div><h3>Pro</h3><span>$20 / month</span></div></section>
        <table><tr><th>Plan</th><th>Monthly price</th></tr><tr><td>Basic</td><td>$8</td></tr></table>''', 'https://a.test/pricing')
        self.assertIn('Pro', result['text'])
        self.assertIn('$20', result['text'])
        self.assertIn('Monthly price', result['text'])

    def test_legacy_website_blob_is_not_indexable(self):
        self.assertEqual(rag_engine.build_report_chunks('a', [{'url': 'https://a.test', 'text': 'Phone: 3997.433.9763'}], [], None, ['https://a.test']), [])

    def test_scoped_chunking_preserves_overlap_and_provenance(self):
        content = '<h2>Catalog</h2>' + ''.join(f'<p>Section {i}. ' + 'Ceramic tiles and catalog details. ' * 50 + '</p>' for i in range(15))
        page = {'url': 'https://a.test', **extraction.extract_evidence(content, 'https://a.test')}
        first = rag_engine.build_report_chunks('a', [page], [], None, ['https://a.test'])
        other = rag_engine.build_report_chunks('b', [page], [], None, ['https://a.test'])
        self.assertGreater(len(first), 2)
        self.assertNotEqual(first[0]['chunk_id'], other[0]['chunk_id'])
        self.assertTrue(all(rag_engine._token_count(c['text']) <= 500 for c in first))
        self.assertTrue(all(c['evidence'] and c['extraction_version'] == 3 for c in first))

    def test_namespace_has_no_truncation_collision(self):
        self.assertNotEqual(rag_engine._chat_collection_name('a'*100+'1'), rag_engine._chat_collection_name('a'*100+'2'))

    def test_embedding_falls_back_to_backup_key_on_quota(self):
        calls = []
        def client(key):
            def embed_content(**kwargs):
                calls.append(key)
                if key == 'primary-test':
                    raise RuntimeError('429 RESOURCE_EXHAUSTED')
                return SimpleNamespace(embeddings=[SimpleNamespace(values=[.1, .2])])
            return SimpleNamespace(models=SimpleNamespace(embed_content=embed_content))
        with patch.object(rag_engine, 'GEMINI_API_KEY', 'primary-test'), patch.object(
            rag_engine, 'GEMINI_API_KEY_BACKUP', 'backup-test'), patch.object(
            rag_engine, '_get_gemini_client', side_effect=client), patch.object(
            rag_engine, '_primary_embedding_key_paused_until', 0.0):
            self.assertEqual(rag_engine._embed_texts_sync(['hello']), [[.1, .2]])
            self.assertEqual(rag_engine._embed_texts_sync(['hello']), [[.1, .2]])
        self.assertEqual(calls, ['primary-test', 'backup-test', 'backup-test'])


class CoverageTests(unittest.TestCase):
    def test_nav_text_prioritizes_opaque_paths_and_balances_categories(self):
        links = coverage.discover_links('https://a.test', '<nav><a href="/x1">Plans</a><a href="/x2">Contact us</a><a href="/x3">FAQ</a><a href="/x4">Connections</a></nav>' + ''.join(f'<a href="/products/{i}">Products</a>' for i in range(30)))
        chosen = coverage.prioritize(links, 5)
        self.assertEqual(set().union(*(set(c['categories']) for c in chosen)), {'pricing', 'contact', 'faq', 'integrations', 'products'})

    def test_missing_is_not_confused_with_discovered_unfetched(self):
        result = coverage.coverage_report([{'url': 'https://a.test', 'categories': ['products']}], [{'url': 'https://a.test/pricing', 'categories': ['pricing']}], ['https://a.test/pricing'])
        self.assertIn('pricing', result['missing'])
        self.assertEqual(result['discovered']['pricing'], ['https://a.test/pricing'])
        self.assertNotIn('pricing', result['found'])


class ConfidenceTests(unittest.TestCase):
    def setUp(self):
        self.chunk = {'chunk_id': 'one', 'text': 'Pro costs $20 per user per month. Annual billing is available.'}
        self.candidate = {'answer': 'Pro costs $20 per user per month.', 'confidence': 'exact', 'sources': ['one'], 'evidence': 'Pro costs $20 per user per month'}
        self.verification = {'supported': True, 'direct': True, 'relevant': True}

    def test_direct_answer_is_actual_quote(self):
        result = scorer.validate_candidate(self.candidate, [self.chunk], self.verification)
        self.assertEqual(result['confidence'], 'exact')
        self.assertIn('Pro costs $20 per user per month', result['answer'])

    def test_ellipsis_and_unicode_punctuation(self):
        self.candidate['evidence'] = 'Pro costs $20 per user per month…Annual billing is available'
        self.assertTrue(scorer.validate_candidate(self.candidate, [self.chunk], self.verification)['valid'])
        self.assertTrue(scorer.quote_spans('Company’s office — River Road', "Company's office - River Road"))

    def test_forged_fragment_and_invented_number_rejected(self):
        for change in [{'evidence': 'Pro costs $20 ... Founder is Alice'}, {'answer': 'Pro costs $900.'}, {'sources': ['other']}]:
            self.assertFalse(scorer.validate_candidate({**self.candidate, **change}, [self.chunk], self.verification)['valid'])

    def test_semantic_mismatch_never_exact(self):
        self.assertFalse(scorer.validate_candidate(self.candidate, [self.chunk], {**self.verification, 'relevant': False})['valid'])

    def test_inference_explicit_in_text(self):
        result = scorer.validate_candidate({**self.candidate, 'confidence': 'inferred'}, [self.chunk], self.verification)
        self.assertEqual(result['confidence'], 'inferred')
        self.assertIn('do not state this directly', result['answer'])

    def test_supported_paraphrase_with_bad_quote_is_downgraded(self):
        candidate = {**self.candidate, 'evidence': 'The Pro plan is billed at twenty dollars monthly'}
        self.assertEqual(scorer.validate_candidate(candidate, [self.chunk], self.verification)['reason'], 'quote_not_in_source')
        recovered = scorer.recover_supported_paraphrase(candidate, [self.chunk], self.verification, 'What does Pro cost?')
        self.assertEqual(recovered['confidence'], 'inferred')
        self.assertIn('do not state this directly', recovered['answer'])
        self.assertIsNone(scorer.recover_supported_paraphrase({**candidate, 'answer': 'Pro costs $900.'}, [self.chunk], self.verification, 'What does Pro cost?'))

    def test_calculation_checked_and_downgraded(self):
        candidate = {**self.candidate, 'answer': 'For 10 users this is $200 per month.', 'calculation': {'expression': '10 * 20'}}
        result = scorer.validate_candidate(candidate, [self.chunk], self.verification, 'How much for 10 users?')
        self.assertTrue(result['valid'])
        self.assertEqual(result['confidence'], 'inferred')
        self.assertIsNone(scorer.checked_calculation({'expression': '__import__("os")'}, '', ''))
        self.assertIsNone(scorer.checked_calculation({'expression': '10 * 900'}, '10 users', '20 dollars'))

    def test_json_fences_wrappers_partial_and_genuinely_truncated(self):
        # parse_model_json requires all 4 required keys; repair suffixes (missing brace/bracket)
        # are accepted only when all keys present, preventing truncated fragments from slipping through.
        complete = '{"answer":"yes","confidence":"exact","sources":["c1"],"evidence":"quote"}'
        for raw in [f'```json\n{complete}\n```', f'Here: {complete}', complete[:-1]]:
            self.assertEqual(scorer.parse_model_json(raw)['answer'], 'yes')
        with self.assertRaises(ValueError):
            scorer.parse_model_json('{"answer":"ye')
