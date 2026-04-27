import unittest

from main import _ride_transition_conflict_detail


class RideTransitionConflictDetailTests(unittest.TestCase):
    def test_request_driver_requested_has_specific_message(self):
        message = _ride_transition_conflict_detail("requested", "request_driver")
        self.assertEqual(
            message,
            "Transition blocked: ride is already requested with another driver.",
        )

    def test_request_driver_unknown_status_has_fallback_message(self):
        message = _ride_transition_conflict_detail("mystery", "request_driver")
        self.assertEqual(
            message,
            "Transition blocked: cannot request driver from status 'mystery'.",
        )

    def test_respond_searching_has_expiry_guidance(self):
        message = _ride_transition_conflict_detail("searching", "respond")
        self.assertIn("status=searching", message)
        self.assertIn("Transition blocked:", message)

    def test_respond_unknown_has_status_context(self):
        message = _ride_transition_conflict_detail("queued", "respond")
        self.assertEqual(
            message,
            "Transition blocked: no pending request to respond to (status=queued).",
        )

    def test_complete_declined_has_explicit_block(self):
        message = _ride_transition_conflict_detail("declined", "complete")
        self.assertEqual(
            message,
            "Transition blocked: declined rides cannot be completed.",
        )

    def test_complete_unknown_has_status_context(self):
        message = _ride_transition_conflict_detail("paused", "complete")
        self.assertEqual(
            message,
            "Transition blocked: ride is not ready for completion (status=paused).",
        )

    def test_request_driver_known_state_messages_are_stable(self):
        expected = {
            "requested": "Transition blocked: ride is already requested with another driver.",
            "accepted": "Transition blocked: ride already accepted. Start a new ride to request another driver.",
            "in_progress": "Transition blocked: ride already in progress. Start a new ride to request another driver.",
            "completed": "Transition blocked: ride already completed. Start a new ride to request another driver.",
            "cancelled": "Transition blocked: ride cancelled. Start a new ride to request another driver.",
        }
        for status, message in expected.items():
            with self.subTest(status=status):
                self.assertEqual(_ride_transition_conflict_detail(status, "request_driver"), message)

    def test_respond_known_state_messages_are_stable(self):
        expected = {
            "accepted": "Transition blocked: ride already accepted.",
            "declined": "Transition blocked: ride already declined.",
            "expired": "Transition blocked: request expired. Passenger must request again.",
            "cancelled": "Transition blocked: ride cancelled.",
            "completed": "Transition blocked: ride already completed.",
            "in_progress": "Transition blocked: ride already in progress.",
        }
        for status, message in expected.items():
            with self.subTest(status=status):
                self.assertEqual(_ride_transition_conflict_detail(status, "respond"), message)

    def test_complete_terminal_state_messages_are_stable(self):
        expected = {
            "declined": "Transition blocked: declined rides cannot be completed.",
            "expired": "Transition blocked: expired rides cannot be completed.",
            "cancelled": "Transition blocked: cancelled rides cannot be completed.",
        }
        for status, message in expected.items():
            with self.subTest(status=status):
                self.assertEqual(_ride_transition_conflict_detail(status, "complete"), message)


if __name__ == "__main__":
    unittest.main()
