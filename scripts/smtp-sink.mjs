import { createServer } from 'node:net';
import { createSecureContext, TLSSocket } from 'node:tls';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Captures local test email; production checks negotiate and validate STARTTLS. */
export async function createSmtpSink(encrypted) {
  const mail = [];
  const sockets = new Set();
  let directory, certificate, secureContext;
  if (encrypted) {
    directory = mkdtempSync(join(tmpdir(), 'itinerary-smtp-'));
    certificate = join(directory, 'certificate.pem');
    const key = join(directory, 'private-key.pem');
    const config = join(directory, 'openssl.cnf');
    writeFileSync(
      config,
      '[req]\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\n[ext]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\n',
    );
    try {
      execFileSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-days',
          '1',
          '-subj',
          '/CN=localhost',
          '-config',
          config,
          '-keyout',
          key,
          '-out',
          certificate,
        ],
        { stdio: 'ignore' },
      );
      secureContext = createSecureContext({
        key: readFileSync(key),
        cert: readFileSync(certificate),
      });
    } catch (error) {
      rmSync(directory, { recursive: true, force: true });
      throw error;
    }
  }
  function accept(socket, greeting = true) {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    if (greeting) socket.write('220 localhost test SMTP\r\n');
    let buffer = '',
      dataMode = false,
      message = '';
    function data(chunk) {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n');
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (dataMode) {
          if (line === '.') {
            mail.push(message);
            message = '';
            dataMode = false;
            socket.write('250 accepted\r\n');
          } else message += line + '\r\n';
        } else if (/^(EHLO|HELO)/i.test(line)) {
          socket.write(
            secureContext && !socket.encrypted
              ? '250-localhost\r\n250 STARTTLS\r\n'
              : '250 localhost\r\n',
          );
        } else if (
          /^STARTTLS/i.test(line) &&
          secureContext &&
          !socket.encrypted
        ) {
          socket.write('220 Ready for TLS\r\n');
          socket.removeListener('data', data);
          accept(
            new TLSSocket(socket, { isServer: true, secureContext }),
            false,
          );
          return;
        } else if (/^DATA/i.test(line)) {
          dataMode = true;
          socket.write('354 send message\r\n');
        } else if (/^QUIT/i.test(line)) socket.end('221 bye\r\n');
        else socket.write('250 OK\r\n');
      }
    }
    socket.on('data', data);
  }
  const smtp = createServer((socket) => accept(socket));
  try {
    await new Promise((resolve, reject) => {
      smtp.once('error', reject);
      smtp.listen(2526, '127.0.0.1', resolve);
    });
  } catch (error) {
    if (directory) rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    mail,
    certificate,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => smtp.close(resolve));
      if (directory) rmSync(directory, { recursive: true, force: true });
    },
  };
}
