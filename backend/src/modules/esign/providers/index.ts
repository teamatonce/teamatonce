/**
 * Esign provider factory.
 *
 * Reads ESIGN_PROVIDER from config and returns the matching provider.
 *
 * Shipped in this PR:
 *   documenso  — recommended open-source default
 *   opensign   — alternative open-source option
 *   none       — disabled
 *
 * Planned follow-ups (tracked in issue #32):
 *   docuseal      — open-source, signer-friendly UX
 *   dropbox-sign  — formerly HelloSign, managed
 *   docusign      — enterprise standard
 */
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { EsignProvider } from './esign-provider.interface';
import { DocumensoProvider } from './documenso.provider';
import { OpenSignProvider } from './opensign.provider';
import { NoneEsignProvider } from './none.provider';

const log = new Logger('EsignProviderFactory');

export function createEsignProvider(config: ConfigService): EsignProvider {
  const choice = (config.get<string>('ESIGN_PROVIDER') || 'none')
    .toLowerCase()
    .trim();

  switch (choice) {
    case 'documenso': {
      const p = new DocumensoProvider(config);
      log.log(
        `Selected esign provider: documenso (available=${p.isAvailable()})`,
      );
      return p;
    }
    case 'opensign':
    case 'open-sign': {
      const p = new OpenSignProvider(config);
      log.log(
        `Selected esign provider: opensign (available=${p.isAvailable()})`,
      );
      return p;
    }
    case 'docuseal':
    case 'dropbox-sign':
    case 'hellosign':
    case 'docusign':
    case 'signwell': {
      log.warn(
        `ESIGN_PROVIDER="${choice}" is planned but not yet implemented (see issue #32). Falling back to "none". Implemented providers: documenso, opensign.`,
      );
      return new NoneEsignProvider();
    }
    case 'none':
    case '':
      return new NoneEsignProvider();
    default:
      log.warn(
        `Unknown ESIGN_PROVIDER="${choice}". Falling back to "none". Valid values: documenso, opensign, none.`,
      );
      return new NoneEsignProvider();
  }
}

export * from './esign-provider.interface';
export { DocumensoProvider } from './documenso.provider';
export { OpenSignProvider } from './opensign.provider';
export { NoneEsignProvider } from './none.provider';
