"""Checks the Day 7 experiment's eligibility and assignment rules on the fictional data.

Run: .venv/bin/python -m unittest discover -s tests -p "test_*.py"
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "analysis"))

from analysis_reproduce import load  # noqa: E402
from day7_assignment import assign_arms, eligible_stalled  # noqa: E402


class Day7Assignment(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workspaces, cls.events, _ = load()
        cls.eligible = eligible_stalled(cls.workspaces, cls.events)

    def test_stalled_cohort_matches_the_reported_345(self):
        self.assertEqual(len(self.eligible), 345)

    def test_nobody_who_paid_before_day_seven_is_eligible(self):
        paid_early = self.workspaces.index[self.workspaces["paid"] & (self.workspaces["paid_day"] < 7)]
        self.assertFalse(set(self.eligible) & set(paid_early))

    def test_arms_are_a_balanced_partition(self):
        arms = assign_arms(self.eligible)
        self.assertEqual(set(arms.index), set(self.eligible))
        counts = arms.value_counts()
        self.assertEqual(counts.sum(), 345)
        self.assertLessEqual(abs(counts["control"] - counts["treatment"]), 1)

    def test_assignment_is_reproducible(self):
        self.assertTrue(assign_arms(self.eligible).equals(assign_arms(self.eligible)))

    def test_different_seed_changes_the_split(self):
        self.assertFalse(assign_arms(self.eligible, seed=1).equals(assign_arms(self.eligible, seed=2)))


if __name__ == "__main__":
    unittest.main()
