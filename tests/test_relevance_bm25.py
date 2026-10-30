import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('relevance_bm25', Path(__file__).resolve().parents[1] / 'scripts/relevance-bm25.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BM25AlignmentTest(unittest.TestCase):
    def test_retrieved_scores_keep_the_original_document_indices(self):
        scores = module.field_scores([['banana'], ['poetry'], ['water']], ['poetry'])
        self.assertEqual(scores[0], 0)
        self.assertGreater(scores[1], 0)
        self.assertEqual(scores[2], 0)

    def test_empty_documents_remain_aligned(self):
        scores = module.field_scores([[], ['poetry'], []], ['poetry'])
        self.assertEqual(scores[0], 0)
        self.assertGreater(scores[1], 0)
        self.assertEqual(scores[2], 0)


if __name__ == '__main__':
    unittest.main()
