/* @flow */

import type {Reporter} from '../../reporters/index.js';
import type Config from '../../config.js';
import type {Manifest} from '../../types.js';
import NoopReporter from '../../reporters/base-reporter.js';
import {Install} from './install.js';
import Lockfile from '../../lockfile';
import buildSubCommands from './_build-sub-commands.js';
import fs from 'fs';

const invariant = require('invariant');

export function hasWrapper(flags: Object, args: Array<string>): boolean {
  return args[0] != 'generate-disclaimer';
}

async function getManifests(config: Config, flags: Object): Promise<Array<Manifest>> {
  const lockfile = await Lockfile.fromDirectory(config.cwd);
  const install = new Install({skipIntegrityCheck: true, ...flags}, config, new NoopReporter(), lockfile);
  await install.hydrate(true);

  let manifests = install.resolver.getManifests();

  // sort by name
  manifests = manifests.sort(function(a, b): number {
    if (!a.name && !b.name) {
      return 0;
    }

    if (!a.name) {
      return 1;
    }

    if (!b.name) {
      return -1;
    }

    return a.name.localeCompare(b.name);
  });

  // filter ignored manifests
  manifests = manifests.filter((manifest: Manifest): boolean => {
    const ref = manifest._reference;
    return !!ref && !ref.ignore;
  });

  return manifests;
}

async function list(config: Config, reporter: Reporter, flags: Object, args: Array<string>): Promise<void> {
  const manifests: Array<Manifest> = await getManifests(config, flags);
  const manifestsByLicense = new Map();

  for (const {name, version, license, repository, homepage, author} of manifests) {
    const licenseKey = license || 'UNKNOWN';
    const url = repository ? repository.url : homepage;
    const vendorUrl = homepage || (author && author.url);
    const vendorName = author && author.name;

    if (!manifestsByLicense.has(licenseKey)) {
      manifestsByLicense.set(licenseKey, new Map());
    }

    const byLicense = manifestsByLicense.get(licenseKey);
    invariant(byLicense, 'expected value');
    byLicense.set(`${name}@${version}`, {
      name,
      version,
      url,
      vendorUrl,
      vendorName,
    });
  }

  if (flags.json) {
    const body = [];

    manifestsByLicense.forEach((license, licenseKey) => {
      license.forEach(({name, version, url, vendorUrl, vendorName}) => {
        body.push([name, version, licenseKey, url || 'Unknown', vendorUrl || 'Unknown', vendorName || 'Unknown']);
      });
    });

    reporter.table(['Name', 'Version', 'License', 'URL', 'VendorUrl', 'VendorName'], body);
  } else {
    const trees = [];

    manifestsByLicense.forEach((license, licenseKey) => {
      const licenseTree = [];

      license.forEach(({name, version, url, vendorUrl, vendorName}) => {
        const children = [];

        if (url) {
          children.push({name: `${reporter.format.bold('URL:')} ${url}`});
        }

        if (vendorUrl) {
          children.push({name: `${reporter.format.bold('VendorUrl:')} ${vendorUrl}`});
        }

        if (vendorName) {
          children.push({name: `${reporter.format.bold('VendorName:')} ${vendorName}`});
        }

        licenseTree.push({
          name: `${name}@${version}`,
          children,
        });
      });

      trees.push({
        name: licenseKey,
        children: licenseTree,
      });
    });

    reporter.tree('licenses', trees, {force: true});
  }
}
export function setFlags(commander: Object) {
  commander.description('Lists licenses for installed packages.');
}
export const {run, examples} = buildSubCommands('licenses', {
  async ls(config: Config, reporter: Reporter, flags: Object, args: Array<string>): Promise<void> {
    reporter.warn(`\`yarn licenses ls\` is deprecated. Please use \`yarn licenses list\`.`);
    await list(config, reporter, flags, args);
  },

  async list(config: Config, reporter: Reporter, flags: Object, args: Array<string>): Promise<void> {
    await list(config, reporter, flags, args);
  },

  async generateDisclaimer(config: Config, reporter: Reporter, flags: Object, args: Array<string>): Promise<void> {
    const manifests: Array<Manifest> = await getManifests(config, flags);
    const data = [];

    for (const manifest of manifests) {
      const { name, version, licenseText, license, homepage, private: manifestIsPrivate } = manifest;

      if (!manifestIsPrivate) {
        data.push({ name, version, licenseText: licenseText ? licenseText.trim() : undefined, license, homepage });
      }
    }

    console.log(JSON.stringify(data));
  },
});
