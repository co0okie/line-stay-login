#!/usr/bin/env python3
"""JSON-lines client for the installed official Chrome DevTools MCP server."""
import glob
import json
import os
import pathlib
import selectors
import shutil
import subprocess
import sys
import time


def main():
    files = glob.glob(str(pathlib.Path.home() / '.npm/_npx/*/node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'))
    if not files:
        raise SystemExit('Chrome DevTools MCP is not installed.')
    server = subprocess.Popen([shutil.which('node'), files[-1], '--autoConnect',
        '--no-usage-statistics', '--no-performance-crux', '--redactNetworkHeaders'],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    selector = selectors.DefaultSelector()
    selector.register(server.stdout, selectors.EVENT_READ)
    buffer = b''
    counter = 0

    def send(message):
        server.stdin.write((json.dumps(message) + '\n').encode())
        server.stdin.flush()

    def request(method, params=None):
        nonlocal buffer, counter
        counter += 1
        request_id = counter
        send(dict(jsonrpc='2.0', id=request_id, method=method, params=params or {}))
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            while b'\n' in buffer:
                line, buffer = buffer.split(b'\n', 1)
                response = json.loads(line)
                if response.get('id') == request_id:
                    return response
            if selector.select(max(0, deadline - time.monotonic())):
                data = os.read(server.stdout.fileno(), 65536)
                if not data:
                    raise RuntimeError('MCP server closed stdout.')
                buffer += data
        raise TimeoutError(method)

    try:
        result = request('initialize', dict(protocolVersion='2025-03-26',
            capabilities={}, clientInfo=dict(name='line-diagnostics', version='1.0')))
        if 'error' in result:
            raise RuntimeError(result['error'])
        send(dict(jsonrpc='2.0', method='notifications/initialized'))
        print(json.dumps(dict(ready=True)), flush=True)
        for line in sys.stdin:
            if not line.strip():
                continue
            try:
                command = json.loads(line)
                print(json.dumps(request(command['method'], command.get('params'))), flush=True)
            except Exception as error:
                print(json.dumps(dict(error=str(error))), flush=True)
    finally:
        selector.close()
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()


if __name__ == '__main__':
    main()
