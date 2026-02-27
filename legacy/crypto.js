(function() {

// function to create certificate
var createCrypto = function(cn, data) {
  console.log(
    'Generating 1024-bit key-pair and certificate for \"' + cn + '\".');
  var keys = forge.pki.rsa.generateKeyPair(1024);
  console.log('key-pair created.');

  var cert = forge.pki.createCertificate();
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(
    cert.validity.notBefore.getFullYear() + 10);
  var attrs = [{
    name: 'commonName',
    value: cn
  }, {
    name: 'countryName',
    value: 'SE'
  }, {
    shortName: 'ST',
    value: 'test-st'
  }, {
    name: 'localityName',
    value: 'testing server'
  }, {
    name: 'organizationName',
    value: 'Web server for chrome'
  }, {
    shortName: 'OU',
    value: 'WSC'
  }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([{
    name: 'basicConstraints',
    cA: true
  }, {
    name: 'keyUsage',
    keyCertSign: true,
    digitalSignature: true,
    nonRepudiation: true,
    keyEncipherment: true,
    dataEncipherment: true
  }, {
    name: 'subjectAltName',
    altNames: [{
      type: 6, // URI
      value: 'http://localhost'
    }]
  }]);
  // FIXME: add subjectKeyIdentifier extension
  // FIXME: add authorityKeyIdentifier extension
  cert.publicKey = keys.publicKey;

  // self-sign certificate
  cert.sign(keys.privateKey, forge.md.sha256.create());

  // save data
  data[cn] = {
    cert: forge.pki.certificateToPem(cert),
    privateKey: forge.pki.privateKeyToPem(keys.privateKey)
  };

  return data;
  console.log('certificate created for \"' + cn + '\": \n');
};

WSC.createCrypto = (name, data) => { return createCrypto(name, data || {}); }
  
})();

