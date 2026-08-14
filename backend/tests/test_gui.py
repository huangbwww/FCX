import json
import queue
import socket
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import gui


class GuiHelpersTest(unittest.TestCase):
    def test_source_server_command_relaunches_gui_entry_with_port(self):
        command = gui.server_command(9123)
        self.assertEqual(command[0], sys.executable)
        self.assertEqual(command[-3:], ["--server", "--port", "9123"])
        self.assertIn("gui.py", command[-4])

    def test_source_icon_path_is_under_backend_resources(self):
        self.assertEqual(
            gui.resource_path("resources/ico.ico"),
            BACKEND / "resources" / "ico.ico",
        )

    def test_port_settings_round_trip_and_invalid_files_fall_back(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "settings.json"
            self.assertEqual(gui.load_port(path), 8000)
            gui.save_port(9123, path)
            self.assertEqual(gui.load_port(path), 9123)
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), {"port": 9123})
            path.write_text('{"port": 80}', encoding="utf-8")
            self.assertEqual(gui.load_port(path), 8000)

    def test_port_validation_range(self):
        self.assertEqual(gui.validate_port("1024"), 1024)
        self.assertEqual(gui.validate_port(65535), 65535)
        for value in (80, 65536, "bad"):
            with self.assertRaisesRegex(ValueError, "1024"):
                gui.validate_port(value)

    def test_utf8_and_gb18030_process_logs_decode_without_replacement(self):
        message = "端口已被占用"
        self.assertEqual(gui.decode_process_line(message.encode("utf-8")), message)
        self.assertEqual(gui.decode_process_line(message.encode("gb18030")), message)
        self.assertNotIn("�", gui.decode_process_line(message.encode("gb18030")))

    def test_bind_error_is_normalized_to_actionable_chinese(self):
        normalized = gui.normalize_process_log(
            "ERROR [WinError 10048] address already in use",
            8000,
        )
        self.assertEqual(normalized, "端口 8000 已被占用，请更换端口或关闭占用程序")

    def test_uvicorn_startup_and_health_logs_are_translated(self):
        samples = {
            "2026-08-03 21:37:07,204 - root - INFO - Starting server...": (
                "2026-08-03 21:37:07,204 - 信息 - 正在启动本地后端…"
            ),
            "INFO:     Started server process [16120]": "后端进程已启动（PID：16120）",
            "INFO:     Waiting for application startup.": "正在初始化服务…",
            "INFO:     Application startup complete.": "服务初始化完成",
            "INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)": (
                "本地后端正在监听：http://127.0.0.1:8000"
            ),
            'INFO:     127.0.0.1:49329 - "GET /health HTTP/1.1" 200 OK': (
                "健康检查成功：GET /health（200，客户端 127.0.0.1:49329）"
            ),
        }
        for source, expected in samples.items():
            with self.subTest(source=source):
                normalized = gui.normalize_process_log(source, 8000)
                self.assertEqual(normalized, expected)
                self.assertNotIn("CTRL+C", normalized)

    def test_non_health_request_log_is_translated(self):
        normalized = gui.normalize_process_log(
            'INFO:     127.0.0.1:49330 - "POST /solve HTTP/1.1" 500 Internal Server Error',
            8000,
        )
        self.assertEqual(
            normalized,
            "请求完成：POST /solve（500，客户端 127.0.0.1:49330）",
        )

    def test_log_panel_is_hidden_until_opened_and_restores_button_copy(self):
        window = object.__new__(gui.BackendWindow)
        window.logs_visible = False
        window.expanded_height = 560
        window.root = MagicMock()
        window.root.winfo_width.return_value = 760
        window.root.winfo_height.return_value = 560
        window.log_frame = MagicMock()
        window.toggle_logs_button = MagicMock()

        window.set_logs_visible(True)
        self.assertTrue(window.logs_visible)
        window.log_frame.pack.assert_called_once_with(fill="both", expand=True)
        window.toggle_logs_button.configure.assert_called_with(text="收起详细日志")

        window.set_logs_visible(False)
        self.assertFalse(window.logs_visible)
        window.log_frame.pack_forget.assert_called_once_with()
        window.toggle_logs_button.configure.assert_called_with(text="查看详细日志")

    def test_failure_expands_log_panel(self):
        window = object.__new__(gui.BackendWindow)
        window.started = True
        window.retry_button = MagicMock()
        window._set_status = MagicMock()
        window.set_logs_visible = MagicMock()

        window._mark_failure("启动失败")

        self.assertFalse(window.started)
        window._set_status.assert_called_once_with("启动失败", "danger")
        window.retry_button.configure.assert_called_once_with(state="normal")
        window.set_logs_visible.assert_called_once_with(True)

    def test_occupied_port_is_detected_before_child_start(self):
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.bind(("127.0.0.1", 0))
        listener.listen(1)
        port = listener.getsockname()[1]
        try:
            self.assertFalse(gui.port_is_available(port))
            messages: queue.Queue[str] = queue.Queue()
            controller = gui.BackendProcessController(messages, port)
            self.assertFalse(controller.start())
            self.assertEqual(
                messages.get_nowait(),
                f"端口 {port} 已被占用，请更换端口或关闭占用程序",
            )
            self.assertIsNone(controller.process)
        finally:
            listener.close()

    def test_health_requires_service_instance_and_selected_port(self):
        messages: queue.Queue[str] = queue.Queue()
        controller = gui.BackendProcessController(messages, 9123)
        controller.instance_token = "expected-instance"

        class Response:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps({
                    "status": "ok",
                    "service": "fcx-backend",
                    "port": 9123,
                    "instance": "expected-instance",
                }).encode("utf-8")

        with patch("urllib.request.urlopen", return_value=Response()) as request:
            self.assertTrue(controller.healthy())
            self.assertEqual(request.call_args.args[0], "http://127.0.0.1:9123/health")


if __name__ == "__main__":
    unittest.main()
