import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AiCredentialSchema, type AiCredential } from '@macpit/shared';
import { HttpError } from '../../lib/http.js';

/** Chave separada do SQLite e do ambiente herdado pelos ptys. Nunca retorna erros de fs com conteúdo. */
export class AiCredentials {
  private session?: AiCredential;
  private readonly file: string;
  constructor(private readonly directory: string) {
    this.file = path.join(directory, 'ai-credential.json');
  }

  private checkDirectory() {
    const stat = fs.lstatSync(this.directory);
    if (!stat.isDirectory() || (stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid?.()) {
      throw new Error('diretório inseguro');
    }
  }

  private failure(): never {
    throw new HttpError(
      503,
      'não foi possível acessar a credencial; confira diretório 0700 e arquivo 0600, sem links simbólicos',
      'ai_credential_storage',
    );
  }

  get(): AiCredential | undefined {
    if (this.session) return this.session;
    let fd: number | undefined;
    try {
      this.checkDirectory();
      try {
        fd = fs.openSync(this.file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
      }
      const stat = fs.fstatSync(fd);
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        (stat.mode & 0o777) !== 0o600 ||
        stat.uid !== process.getuid?.() ||
        stat.size > 4096
      ) {
        throw new Error('arquivo inseguro');
      }
      const credential = AiCredentialSchema.parse(JSON.parse(fs.readFileSync(fd, 'utf8')));
      if (credential.storage !== 'disk') throw new Error('armazenamento inválido');
      return credential;
    } catch {
      return this.failure();
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  }

  set(credential: AiCredential) {
    let temporary: string | undefined;
    try {
      this.checkDirectory();
      if (credential.storage === 'session') {
        this.removeFile();
        this.session = credential;
        return;
      }
      temporary = path.join(this.directory, `.ai-credential-${randomUUID()}.tmp`);
      const fd = fs.openSync(
        temporary,
        fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
        0o600,
      );
      try {
        fs.writeFileSync(fd, JSON.stringify(credential));
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(temporary, this.file);
      this.session = undefined;
    } catch {
      this.failure();
    } finally {
      if (temporary) fs.rmSync(temporary, { force: true });
    }
  }

  private removeFile() {
    try {
      fs.unlinkSync(this.file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  remove() {
    try {
      this.checkDirectory();
      this.removeFile();
      this.session = undefined;
    } catch {
      this.failure();
    }
  }

  close() {
    this.session = undefined;
  }
}
