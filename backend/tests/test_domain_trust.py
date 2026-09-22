"""
test_domain_trust.py — Unit tests for classify_and_filter() and domain trust logic.

Tests cover:
    - LinkedIn (and other BLOCKED_DOMAINS) never appear in output
    - Same-domain URLs always get confidence=1.0 and tier="first_party"
    - Trusted-tier domains (crunchbase, g2, capterra, producthunt) get correct weights
    - Unverified external URLs get confidence=0.4 and tier="unverified_external"
    - Output is sorted: first_party → trusted_enrichment → unverified_external
    - www. stripping works for both company domain and blocked domain matching
"""

import sys
import os
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.search.base import SearchResult
from config.domain_trust import (
    BLOCKED_DOMAINS,
    TRUSTED_ENRICHMENT_DOMAINS,
    classify_and_filter,
    _is_blocked,
    _strip_www,
)


def _result(url: str, source: str = "ddg") -> SearchResult:
    return SearchResult(title="T", url=url, snippet="S", source=source)


class TestBlockedDomains(unittest.TestCase):
    def test_linkedin_never_in_output(self):
        """LinkedIn URL must never appear in classify_and_filter output."""
        results = [_result("https://www.linkedin.com/company/acme")]
        seeds = classify_and_filter(results, "acme.com")
        urls = [s.url for s in seeds]
        self.assertNotIn("https://www.linkedin.com/company/acme", urls)

    def test_facebook_never_in_output(self):
        results = [_result("https://www.facebook.com/acme")]
        seeds = classify_and_filter(results, "acme.com")
        self.assertEqual(seeds, [])

    def test_instagram_never_in_output(self):
        results = [_result("https://instagram.com/acmecorp")]
        seeds = classify_and_filter(results, "acme.com")
        self.assertEqual(seeds, [])

    def test_twitter_never_in_output(self):
        results = [_result("https://twitter.com/acme")]
        seeds = classify_and_filter(results, "acme.com")
        self.assertEqual(seeds, [])

    def test_all_blocked_filtered_from_mixed_list(self):
        """A list with some blocked and some valid URLs only returns the valid ones."""
        results = [
            _result("https://linkedin.com/company/a"),
            _result("https://crunchbase.com/organization/a"),
            _result("https://facebook.com/a"),
        ]
        seeds = classify_and_filter(results, "example.com")
        urls = [s.url for s in seeds]
        self.assertNotIn("https://linkedin.com/company/a", urls)
        self.assertNotIn("https://facebook.com/a", urls)
        self.assertIn("https://crunchbase.com/organization/a", urls)

    def test_is_blocked_helper_with_www_prefix(self):
        """_is_blocked() must catch both 'linkedin.com' and 'www.linkedin.com'."""
        self.assertTrue(_is_blocked("linkedin.com"))
        self.assertTrue(_is_blocked("www.linkedin.com"))
        self.assertFalse(_is_blocked("crunchbase.com"))


class TestSameDomainConfidence(unittest.TestCase):
    def test_same_domain_confidence_1_0(self):
        """Same-domain URLs must get confidence=1.0."""
        results = [_result("https://acme.com/pricing")]
        seeds = classify_and_filter(results, "acme.com")
        self.assertEqual(len(seeds), 1)
        self.assertAlmostEqual(seeds[0].confidence, 1.0)
        self.assertEqual(seeds[0].tier, "first_party")

    def test_same_domain_with_www_company_domain(self):
        """Company domain passed as 'www.acme.com' should match 'acme.com' URLs."""
        results = [_result("https://acme.com/about")]
        seeds = classify_and_filter(results, "www.acme.com")
        self.assertEqual(len(seeds), 1)
        self.assertEqual(seeds[0].tier, "first_party")

    def test_same_domain_www_url(self):
        """URL with www. prefix against bare company domain should still be first_party."""
        results = [_result("https://www.acme.com/features")]
        seeds = classify_and_filter(results, "acme.com")
        self.assertEqual(len(seeds), 1)
        self.assertEqual(seeds[0].tier, "first_party")


class TestTrustedEnrichmentDomains(unittest.TestCase):
    def test_crunchbase_weight(self):
        results = [_result("https://crunchbase.com/organization/acme")]
        seeds = classify_and_filter(results, "acme.com")
        self.assertEqual(len(seeds), 1)
        self.assertAlmostEqual(seeds[0].confidence, 0.80)
        self.assertEqual(seeds[0].tier, "trusted_enrichment")

    def test_g2_weight(self):
        results = [_result("https://g2.com/products/acme")]
        seeds = classify_and_filter(results, "acme.com")
        self.assertAlmostEqual(seeds[0].confidence, 0.75)

    def test_capterra_weight(self):
        results = [_result("https://capterra.com/p/acme")]
        seeds = classify_and_filter(results, "acme.com")
        self.assertAlmostEqual(seeds[0].confidence, 0.75)

    def test_producthunt_weight(self):
        results = [_result("https://producthunt.com/posts/acme")]
        seeds = classify_and_filter(results, "acme.com")
        self.assertAlmostEqual(seeds[0].confidence, 0.70)

    def test_www_prefix_trusted_domain(self):
        """www.crunchbase.com should also be recognized as trusted."""
        results = [_result("https://www.crunchbase.com/organization/acme")]
        seeds = classify_and_filter(results, "acme.com")
        self.assertEqual(seeds[0].tier, "trusted_enrichment")
        self.assertAlmostEqual(seeds[0].confidence, 0.80)


class TestUnverifiedExternal(unittest.TestCase):
    def test_random_domain_confidence_0_4(self):
        results = [_result("https://randomnewssite.com/article/acme")]
        seeds = classify_and_filter(results, "acme.com")
        self.assertEqual(len(seeds), 1)
        self.assertAlmostEqual(seeds[0].confidence, 0.4)
        self.assertEqual(seeds[0].tier, "unverified_external")

    def test_empty_company_domain_treats_all_as_external(self):
        """If no company domain is provided, no URL can be first_party."""
        results = [_result("https://somesite.com/page")]
        seeds = classify_and_filter(results, "")
        self.assertEqual(seeds[0].tier, "unverified_external")


class TestOutputSorting(unittest.TestCase):
    def test_sort_order_first_party_first(self):
        """Output must be sorted: first_party → trusted_enrichment → unverified_external."""
        results = [
            _result("https://random.io/article"),             # unverified
            _result("https://g2.com/products/acme"),          # trusted
            _result("https://acme.com/about"),                # first_party
            _result("https://crunchbase.com/org/acme"),       # trusted (higher confidence)
        ]
        seeds = classify_and_filter(results, "acme.com")
        tiers = [s.tier for s in seeds]
        # first_party must come first
        self.assertEqual(tiers[0], "first_party")
        # trusted_enrichment entries before unverified
        last_trusted_idx = max(i for i, t in enumerate(tiers) if t == "trusted_enrichment")
        first_unverified_idx = min(i for i, t in enumerate(tiers) if t == "unverified_external")
        self.assertLess(last_trusted_idx, first_unverified_idx)

    def test_trusted_sorted_by_confidence_desc(self):
        """Among trusted_enrichment, higher confidence comes first."""
        results = [
            _result("https://producthunt.com/posts/acme"),    # 0.70
            _result("https://crunchbase.com/org/acme"),       # 0.80
            _result("https://g2.com/products/acme"),          # 0.75
        ]
        seeds = classify_and_filter(results, "other.com")
        trusted = [s for s in seeds if s.tier == "trusted_enrichment"]
        confidences = [s.confidence for s in trusted]
        self.assertEqual(confidences, sorted(confidences, reverse=True))


class TestStripWwwHelper(unittest.TestCase):
    def test_strips_www(self):
        self.assertEqual(_strip_www("www.example.com"), "example.com")

    def test_no_www(self):
        self.assertEqual(_strip_www("example.com"), "example.com")

    def test_internal_www_not_stripped(self):
        # "mywwwsite.com" should not be changed
        self.assertEqual(_strip_www("mywwwsite.com"), "mywwwsite.com")


if __name__ == "__main__":
    unittest.main()
