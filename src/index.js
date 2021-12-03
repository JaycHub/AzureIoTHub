/**
 * index.js 
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

'use strict';
const FotAzureIoTHubAdapter = require('./fot-azureiothub-adapter.js');
const manifest = require('../manifest.json');
module.exports = function (addonManager, _, errorCallback) {
    const pkgManifest = manifest;
    new FotAzureIoTHubAdapter(addonManager, pkgManifest, (error) => errorCallback(pkgManifest.id, error));
};
