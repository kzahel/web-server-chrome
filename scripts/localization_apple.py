"""Apple string catalogs adapter; each source key keeps native placeholder syntax.

This app currently has no plural/device-varying Apple messages. Unsupported
variations fail explicitly rather than dropping their contents during import.
"""
import re
from pathlib import Path
from localization import Workspace
from localization_common import Invalid, atomic_write, digest, json_text, read_json, validate_literals
from translation_terms import terminology_hash

CATALOGS = {'Localizable': 'ios/200OK/Resources/Localizable.xcstrings', 'InfoPlist': 'ios/200OK/Resources/InfoPlist.xcstrings'}

def contract(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 65536:
        raise Invalid('Apple translation must be nonempty text <=65536 characters')
    tokens = re.findall(r'%(?:[1-9][0-9]*\$)?(?:lld|ld|@|d|f|s|%)', value)
    if '%' in re.sub(r'%(?:[1-9][0-9]*\$)?(?:lld|ld|@|d|f|s|%)', '', value):
        raise Invalid('unsupported Apple format specifier')
    return sorted(token for token in tokens if token != '%%')

class AppleWorkspace(Workspace):
    def __init__(self, root, locale):
        if not re.fullmatch(r'[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*', locale) or locale == 'en':
            raise Invalid('choose a configured non-English locale')
        self.root, self.platform, self.locale = root, 'ios', locale
        self.metadata = root / 'localization/ios' / f'{locale}.json'
        self.documents, self.locations, self.source, self.translated = {}, {}, {}, {}
        for table, relative in CATALOGS.items():
            document = read_json(root / relative)
            if document.get('sourceLanguage') != 'en': raise Invalid('Apple source language must be en')
            self.documents[table] = document
            for key, entry in document['strings'].items():
                identifier = f'{table}:{key}'
                source = entry['localizations']['en']
                if set(source) != {'stringUnit'}: raise Invalid(f'Apple variations require an explicit adapter: {identifier}')
                value = source['stringUnit']['value']
                row = {'kind': 'apple', 'value': value, 'context': [entry.get('comment', '')], 'arguments': contract(value)}
                row['sourceHash'] = digest(row)
                row['terminologyHash'] = terminology_hash(root, locale, value, row['context'])
                self.source[identifier] = row
                self.locations[identifier] = (table, key)
                target = entry['localizations'].get(locale)
                if target:
                    if set(target) != {'stringUnit'}: raise Invalid(f'Unsupported Apple target variation: {identifier}')
                    self.translated[identifier] = target['stringUnit']['value']
        self.ledger = read_json(self.metadata) if self.metadata.exists() else {'schemaVersion': 1, 'platform': 'ios', 'locale': locale, 'resources': {}}
        if self.ledger.get('locale') != locale or self.ledger.get('platform') != 'ios' or self.ledger.get('schemaVersion') != 1: raise Invalid('invalid Apple review metadata')

    def translation_hash(self, name):
        return digest({'kind': 'apple', 'value': self.translated[name]}) if name in self.translated else None

    def validate_values(self, values):
        for name, value in values.items():
            validate_literals(self.source[name]["value"], value)
            if contract(value) != self.source[name]['arguments']: raise Invalid(f'{name}: incompatible Apple placeholders')

    def write(self):
        for name, text in self.translated.items():
            if name not in self.locations: continue
            table, key = self.locations[name]
            self.documents[table]['strings'][key]['localizations'][self.locale] = {'stringUnit': {'state': 'translated', 'value': text}}
        for table, relative in CATALOGS.items(): atomic_write(self.root / relative, json_text(self.documents[table]))
        atomic_write(self.metadata, json_text(self.ledger))
