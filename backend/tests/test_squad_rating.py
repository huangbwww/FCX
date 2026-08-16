import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd
from ortools.sat.python import cp_model


BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("FCX_SOLVER_WRITE_LOGS", "0")

import optimize


def solve_group_choice(groups, target=83, scope="GREATER", max_overshoot=0.8):
    """Choose one complete squad and return its name and computed rating."""
    squad_size = len(groups[0]["ratings"])
    if any(len(group["ratings"]) != squad_size for group in groups):
        raise ValueError("all candidate squads must have the same size")
    model = cp_model.CpModel()
    selectors = [model.NewBoolVar(f"group_{index}") for index in range(len(groups))]
    model.Add(sum(selectors) == 1)

    ratings = []
    prices = []
    players = []
    for group_index, group in enumerate(groups):
        for player_index, rating in enumerate(group["ratings"]):
            player = model.NewBoolVar(f"player_{group_index}_{player_index}")
            model.Add(player == selectors[group_index])
            players.append(player)
            ratings.append(rating)
            prices.append(group["prices"][player_index])

    dataframe = pd.DataFrame({"rating": ratings, "price": prices})
    map_idx = {"rating": {rating: index for index, rating in enumerate(sorted(set(ratings)))}}
    grouped = {"rating": {}}
    for index, rating in enumerate(ratings):
        grouped["rating"].setdefault(map_idx["rating"][rating], []).append(players[index])

    model, rating_priority, _, _, rating_window = optimize.create_squad_rating_constraint_3(
        dataframe,
        model,
        players,
        map_idx,
        grouped,
        [len(players)],
        squad_size,
        target,
        scope,
        max_overshoot,
    )
    if scope == "LOWER":
        optimize.set_objective(dataframe, model, players)
        solver = cp_model.CpSolver()
        status = int(solver.Solve(model))
    else:
        solver, status, _diagnostics = optimize.solve_minimum_rating_then_cost(
            dataframe,
            model,
            players,
            rating_priority,
            rating_window,
            5,
        )
    selected_group = next(
        (index for index, selector in enumerate(selectors) if solver.Value(selector)),
        None,
    ) if solver is not None and status in (cp_model.FEASIBLE, cp_model.OPTIMAL) else None
    if selected_group is None:
        return status, None, None
    return (
        status,
        groups[selected_group]["name"],
        optimize.calculate_squad_rating(groups[selected_group]["ratings"]),
    )


class SquadRatingTest(unittest.TestCase):
    def test_rating_windows_are_dynamic_for_common_targets(self):
        for target in (80, 82, 83, 84, 86, 88, 90):
            with self.subTest(target=target):
                window = optimize.squad_rating_window(target, 11)
                self.assertEqual(window["minimum"], float(target))
                self.assertEqual(window["maximum"], target + 0.8)

    def test_rating_window_for_eleven_players_is_strict(self):
        window = optimize.squad_rating_window(83, 11)
        self.assertEqual(window["minimum"], 83.0)
        self.assertEqual(window["maximum"], 83.8)
        self.assertEqual(window["minimum_rounded_total"], 913)
        self.assertEqual(window["maximum_rounded_total"], 921)

    def test_rating_window_accepts_configurable_overshoot(self):
        for overshoot, maximum in ((0, 83.0), (0.1, 83.1), (0.8, 83.8), (2, 85.0), (5, 88.0)):
            with self.subTest(overshoot=overshoot):
                window = optimize.squad_rating_window(
                    83,
                    11,
                    max_overshoot=overshoot,
                )
                self.assertEqual(window["minimum"], 83.0)
                self.assertEqual(window["maximum"], maximum)

    def test_rating_window_normalizes_tenths_and_rejects_invalid_values(self):
        self.assertEqual(
            optimize.squad_rating_window(83, 11, max_overshoot=2.04)["maximum"],
            85.0,
        )
        self.assertEqual(
            optimize.squad_rating_window(83, 11, max_overshoot=2.06)["maximum"],
            85.1,
        )
        for invalid in (-0.1, 5.1, float("inf")):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    optimize.squad_rating_window(83, 11, max_overshoot=invalid)

    def test_wider_window_still_prefers_the_lowest_rating(self):
        status, name, rating = solve_group_choice(
            [
                {"name": "lowest", "ratings": [83] * 11, "prices": [100] * 11},
                {"name": "cheaper_high", "ratings": [85] * 11, "prices": [1] * 11},
            ],
            max_overshoot=2,
        )
        self.assertEqual(status, cp_model.OPTIMAL)
        self.assertEqual(name, "lowest")
        self.assertEqual(rating, 83.0)

    def test_score_calculation_uses_actual_squad_size(self):
        self.assertEqual(optimize.calculate_squad_rating([83] * 11), 83.0)
        self.assertEqual(optimize.calculate_squad_rating([83] * 3), 83.0)
        self.assertEqual(
            optimize.calculate_squad_rating([84] * 5 + [83] * 6),
            83.73,
        )

    def test_rejects_cheaper_squad_above_window(self):
        status, name, rating = solve_group_choice([
            {"name": "valid", "ratings": [83] * 11, "prices": [100] * 11},
            {"name": "too_high", "ratings": [86] * 11, "prices": [1] * 11},
        ])
        self.assertEqual(status, cp_model.OPTIMAL)
        self.assertEqual(name, "valid")
        self.assertEqual(rating, 83.0)

    def test_rating_wins_before_cost_inside_window(self):
        status, name, rating = solve_group_choice([
            {"name": "lowest_rating", "ratings": [83] * 11, "prices": [100] * 11},
            {
                "name": "cheaper_but_higher",
                "ratings": [84] * 5 + [83] * 6,
                "prices": [1] * 11,
            },
        ])
        self.assertEqual(status, cp_model.OPTIMAL)
        self.assertEqual(name, "lowest_rating")
        self.assertEqual(rating, 83.0)

    def test_window_accepts_83_73_but_rejects_83_82(self):
        status, name, rating = solve_group_choice([
            {
                "name": "inside",
                "ratings": [84] * 5 + [83] * 6,
                "prices": [100] * 11,
            },
            {
                "name": "outside",
                "ratings": [84] * 6 + [83] * 5,
                "prices": [1] * 11,
            },
        ])
        self.assertEqual(status, cp_model.OPTIMAL)
        self.assertEqual(name, "inside")
        self.assertEqual(rating, 83.73)

    def test_cost_breaks_ties_after_rating(self):
        status, name, rating = solve_group_choice([
            {"name": "expensive", "ratings": [83] * 11, "prices": [100] * 11},
            {"name": "cheap", "ratings": [83] * 11, "prices": [1] * 11},
        ])
        self.assertEqual(status, cp_model.OPTIMAL)
        self.assertEqual(name, "cheap")
        self.assertEqual(rating, 83.0)

    def test_returns_infeasible_when_only_overrated_squad_exists(self):
        status, name, rating = solve_group_choice([
            {"name": "too_high", "ratings": [86] * 11, "prices": [1] * 11},
        ])
        self.assertEqual(status, cp_model.INFEASIBLE)
        self.assertIsNone(name)
        self.assertIsNone(rating)

    def test_exact_uses_the_same_strict_ea_rating_bucket(self):
        status, name, rating = solve_group_choice(
            [{"name": "valid", "ratings": [83] * 11, "prices": [1] * 11}],
            scope="EXACT",
        )
        self.assertEqual(status, cp_model.OPTIMAL)
        self.assertEqual(name, "valid")
        self.assertEqual(rating, 83.0)

    def test_lower_remains_a_maximum_rating_constraint(self):
        status, name, rating = solve_group_choice(
            [
                {"name": "valid", "ratings": [83] * 11, "prices": [100] * 11},
                {"name": "too_high", "ratings": [84] * 11, "prices": [1] * 11},
            ],
            scope="LOWER",
        )
        self.assertEqual(status, cp_model.OPTIMAL)
        self.assertEqual(name, "valid")
        self.assertEqual(rating, 83.0)

    def test_non_eleven_player_constraint_uses_actual_size(self):
        status, name, rating = solve_group_choice([
            {"name": "valid", "ratings": [83] * 3, "prices": [100] * 3},
            {"name": "too_high", "ratings": [84] * 3, "prices": [1] * 3},
        ])
        self.assertEqual(status, cp_model.OPTIMAL)
        self.assertEqual(name, "valid")
        self.assertEqual(rating, 83.0)

    def test_does_not_return_a_feasible_rating_without_optimal_proof(self):
        model = cp_model.CpModel()
        player = model.NewBoolVar("player")
        model.Add(player == 1)
        rating = model.NewIntVar(8300, 8380, "rating")
        dataframe = pd.DataFrame({"price": [1]})

        class FeasibleOnlySolver:
            def Solve(self, _model):
                return cp_model.FEASIBLE

        with patch.object(optimize, "_new_solver", return_value=FeasibleOnlySolver()):
            solver, status, diagnostics = optimize.solve_minimum_rating_then_cost(
                dataframe,
                model,
                [player],
                rating,
                {"minimum": 83.0, "maximum": 83.8},
                1,
            )

        self.assertIsNone(solver)
        self.assertEqual(status, cp_model.UNKNOWN)
        self.assertFalse(diagnostics["rating_optimal"])
        self.assertEqual(
            diagnostics["failure_code"],
            "RATING_OPTIMUM_NOT_PROVEN",
        )

    def test_falls_back_to_proven_rating_solution_when_cost_stage_fails(self):
        model = cp_model.CpModel()
        player = model.NewBoolVar("player")
        model.Add(player == 1)
        rating = model.NewIntVar(8300, 8380, "rating")
        dataframe = pd.DataFrame({"price": [1]})

        class RatingSolver:
            def Solve(self, _model):
                return cp_model.OPTIMAL

            def Value(self, variable):
                return 8300 if variable is rating else 1

        class FailedCostSolver:
            def Solve(self, _model):
                return cp_model.UNKNOWN

        rating_solver = RatingSolver()
        with patch.object(
            optimize,
            "_new_solver",
            side_effect=[rating_solver, FailedCostSolver()],
        ):
            solver, status, diagnostics = optimize.solve_minimum_rating_then_cost(
                dataframe,
                model,
                [player],
                rating,
                {"minimum": 83.0, "maximum": 83.8},
                5,
            )

        self.assertIs(solver, rating_solver)
        self.assertEqual(status, cp_model.FEASIBLE)
        self.assertTrue(diagnostics["rating_optimal"])
        self.assertFalse(diagnostics["cost_optimal"])
        self.assertEqual(diagnostics["minimum_rating"], 83.0)


if __name__ == "__main__":
    unittest.main()
