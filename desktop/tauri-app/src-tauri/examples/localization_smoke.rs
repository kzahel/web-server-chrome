fn main() {
    let report = std::env::args().nth(1).expect("report JSON path");
    let locale = std::env::args().nth(2).unwrap_or_else(|| "de".to_owned());
    #[cfg(debug_assertions)]
    ok200_desktop_lib::run_localization_smoke(std::path::PathBuf::from(report), locale);
    #[cfg(not(debug_assertions))]
    panic!("localization smoke is a debug-only development tool: {report}, {locale}");
}
