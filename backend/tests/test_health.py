import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException


BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import main


class HealthCapabilityTest(unittest.TestCase):
    def test_health_advertises_minimum_rating_first_v2(self):
        payload = asyncio.run(main.health())
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["service"], "fcx-backend")
        self.assertEqual(
            payload["solver_features"]["minimum_rating_first"],
            2,
        )
        self.assertEqual(
            payload["solver_features"]["strict_rating_window"],
            1,
        )
        self.assertEqual(
            payload["solver_features"]["configurable_rating_window"],
            1,
        )

    def test_solve_request_defaults_and_forwards_rating_overshoot(self):
        request = {
            "sbcData": {"constraints": []},
            "clubPlayers": [],
            "maxSolveTime": 10,
        }
        with patch.object(main.setup, "runAutoSBC", return_value={"status": "ok"}) as solve:
            main.process_solve_request(request)
        self.assertEqual(solve.call_args.args[0]["ratingOvershoot"], 0.8)

        request["ratingOvershoot"] = 2.04
        with patch.object(main.setup, "runAutoSBC", return_value={"status": "ok"}) as solve:
            main.process_solve_request(request)
        self.assertEqual(solve.call_args.args[0]["ratingOvershoot"], 2.0)

    def test_solve_request_rejects_invalid_rating_overshoot(self):
        request = {
            "sbcData": {"constraints": []},
            "clubPlayers": [],
            "maxSolveTime": 10,
            "ratingOvershoot": 5.1,
        }
        with self.assertRaises(HTTPException) as raised:
            main.process_solve_request(request)
        self.assertEqual(raised.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
