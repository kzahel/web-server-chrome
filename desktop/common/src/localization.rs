//! Offline presentation catalogs. Protocol, HTTP and persisted server state stay unchanged.
use std::collections::HashMap;
use std::sync::OnceLock;

include!("generated_localization.rs");

/// Native UI languages, ordered as returned by the operating system.
#[must_use]
pub fn system_languages() -> Vec<String> {
    sys_locale::get_locales().collect()
}

#[must_use]
pub fn resolve(preference: &str, requested: &[String]) -> &'static str {
    let candidates = if preference == "system" {
        requested.to_vec()
    } else {
        vec![preference.to_owned()]
    };
    for tag in candidates {
        if let Some(locale) = lookup(&tag, &supported_locales()) {
            return locale;
        }
    }
    "en"
}

fn lookup<'a>(input: &str, available: &[&'a str]) -> Option<&'a str> {
    let tag = input.replace('_', "-").to_ascii_lowercase();
    let parts: Vec<_> = tag.split('-').collect();
    let base_end = parts
        .iter()
        .position(|part| part.len() == 1)
        .unwrap_or(parts.len());
    let parts = &parts[..base_end];
    if parts.is_empty() {
        return None;
    }
    let base = parts.join("-");
    if let Some(locale) = available
        .iter()
        .find(|locale| locale.eq_ignore_ascii_case(&base))
    {
        return Some(*locale);
    }
    let language = parts[0];
    let region = parts
        .iter()
        .skip(1)
        .find(|part| part.len() == 2 || part.chars().all(|character| character.is_ascii_digit()));
    let script = parts.iter().skip(1).find(|part| part.len() == 4);
    let equivalent = if language == "zh" {
        match (script.copied(), region.copied()) {
            (Some("hans"), _) | (None, Some("cn" | "sg")) => Some("zh-CN"),
            (Some("hant"), _) | (None, Some("tw" | "hk" | "mo")) => Some("zh-TW"),
            _ => None,
        }
    } else if language == "pt" && region.copied() == Some("br") {
        Some("pt-BR")
    } else {
        None
    };
    if language == "zh" || equivalent.is_some() {
        return equivalent
            .and_then(|target| available.iter().copied().find(|locale| *locale == target));
    }
    for length in (1..parts.len()).rev() {
        let parent = parts[..length].join("-");
        if let Some(locale) = available
            .iter()
            .find(|locale| locale.eq_ignore_ascii_case(&parent))
        {
            return Some(*locale);
        }
    }
    None
}

#[must_use]
pub fn supported_locales() -> Vec<&'static str> {
    CATALOGS.iter().map(|(locale, _)| *locale).collect()
}

fn catalogs() -> &'static HashMap<String, HashMap<String, String>> {
    static DATA: OnceLock<HashMap<String, HashMap<String, String>>> = OnceLock::new();
    DATA.get_or_init(|| {
        CATALOGS
            .iter()
            .map(|(locale, source)| {
                (
                    (*locale).to_owned(),
                    serde_json::from_str(source).expect("checked native locale catalog"),
                )
            })
            .collect()
    })
}

#[must_use]
pub fn text(locale: &str, key: &str) -> &'static str {
    catalogs()
        .get(locale)
        .and_then(|values| values.get(key))
        .or_else(|| catalogs().get("en").and_then(|values| values.get(key)))
        .map_or("", String::as_str)
}

#[must_use]
pub fn system_text(key: &str) -> &'static str {
    text(resolve("system", &system_languages()), key)
}

#[must_use]
pub fn translate(locale: &str, english: &str) -> String {
    catalogs()
        .values()
        .find_map(|values| values.iter().find(|(_, value)| *value == english))
        .map_or_else(
            || english.to_owned(),
            |(key, _)| text(locale, key).to_owned(),
        )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scripts_and_regions_keep_independent_native_catalogs_compatible() {
        let locales = ["en", "de", "pt-BR", "zh-CN", "zh-TW"];
        assert_eq!(lookup("pt-Latn-BR", &locales), Some("pt-BR"));
        assert_eq!(lookup("zh-Hant-CN", &locales), Some("zh-TW"));
        assert_eq!(lookup("zh-Hans-TW", &locales), Some("zh-CN"));
        assert_eq!(lookup("zh-HK", &locales), Some("zh-TW"));
        assert_eq!(lookup("zh-Latn-CN", &locales), None);
        assert_eq!(lookup("zh", &locales), None);
        assert_eq!(lookup("de-AT-u-nu-latn", &locales), Some("de"));
    }

    #[test]
    fn preferences_keep_unknown_values_and_fallback_without_server_changes() {
        assert_eq!(resolve("system", &["xx".into(), "de-AT".into()]), "de");
        assert_eq!(resolve("zz-ZZ", &["de".into()]), "en");
        assert_eq!(translate("de", "Quit"), "Beenden");
        assert_eq!(
            translate("de", "future unknown diagnostic"),
            "future unknown diagnostic"
        );
    }
}
