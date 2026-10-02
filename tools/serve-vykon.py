"""Rovnaká HTTP kompresia pre oba statické varianty merania."""
import gzip
import io
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        if self.path.endswith('/'):
            path += '/index.html'
        content_type = self.guess_type(path)
        if ('gzip' in self.headers.get('Accept-Encoding', '') and
                content_type in ('text/html', 'text/css', 'text/javascript', 'application/javascript', 'application/json')):
            try:
                with open(path, 'rb') as source:
                    body = gzip.compress(source.read(), compresslevel=6)
            except OSError:
                return super().send_head()
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Vary', 'Accept-Encoding')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            return io.BytesIO(body)
        return super().send_head()


if __name__ == '__main__':
    import os
    os.chdir(sys.argv[2])
    ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
