import contextlib
import io
import json
import re
import unittest

import build


def built() -> dict[str, str]:
    with contextlib.redirect_stdout(io.StringIO()):
        build.build()
    return {f.name: f.read_text(encoding="utf-8") for f in build.OUT.glob("*.html")}


class BuildTest(unittest.TestCase):
    def test_two_pages(self):
        self.assertEqual(sorted(built()), ["benchmarks.html", "index.html"])

    def test_links_stay_on_the_site(self):
        """Every relative link points at a built page or a static file."""
        for name, page in built().items():
            for href in re.findall(r'href="([^"#]*)[^"]*"', page):
                if not href or re.match(r"[a-z]+:", href):
                    continue
                with self.subTest(page=name, href=href):
                    self.assertTrue((build.OUT / href).exists())

    def test_no_unions(self):
        bench = json.loads((build.DATA / "benchmarks.json").read_text(encoding="utf-8"))
        self.assertNotIn("combinations", bench)
        self.assertNotIn("combination_results", bench)
        page = built()["benchmarks.html"]
        self.assertNotIn("data-union", page)
        self.assertNotIn(" OR ", page)
        self.assertEqual(page.count('class="frame"'), 1)

    def test_detector_names_link_to_their_docs(self):
        detectors = json.loads((build.DATA / "detectors.json").read_text(encoding="utf-8"))["detectors"]
        page = built()["benchmarks.html"]
        for d in detectors:
            with self.subTest(detector=d["id"]):
                self.assertIn(f'<a href="{build.esc(d["docs"])}">{build.esc(d["name"])}</a>', page)

    def test_reads_tags(self):
        """The Benchmarks tags print each group's label."""
        families = json.loads((build.DATA / "detectors.json").read_text(encoding="utf-8"))["families"]
        page = built()["benchmarks.html"]
        tags = set(re.findall(r'<span class="tag">([^<]+)</span>', page))
        self.assertEqual(tags, {build.esc(f["label"]) for f in families.values()})


if __name__ == "__main__":
    unittest.main()
