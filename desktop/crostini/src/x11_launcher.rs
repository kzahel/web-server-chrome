use std::cmp::max;
use std::env;
use std::fs;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use std::time::{Duration, Instant};

use font8x8::{UnicodeFonts, BASIC_FONTS};
use fontdue::{Font, FontSettings};
use x11rb::connection::Connection;
use x11rb::protocol::xproto::ConnectionExt as _;
use x11rb::protocol::xproto::{
    Arc, AtomEnum, ButtonPressEvent, ConfigureWindowAux, CreateGCAux, CreateWindowAux, EventMask,
    Gcontext, PropMode, Rectangle, Window, WindowClass,
};
use x11rb::protocol::Event;
use x11rb::wrapper::ConnectionExt as _;
use x11rb::COPY_DEPTH_FROM_PARENT;

use crate::{execute_launch, SystemBackend, APPLICATION_ID};

const BASE_WORKING_WIDTH: u16 = 320;
const BASE_WORKING_HEIGHT: u16 = 96;
const BASE_FAILURE_WIDTH: u16 = 480;
const BASE_FAILURE_HEIGHT: u16 = 228;
const BASE_DPI: f64 = 96.0;
const MINIMUM_VISIBLE_TIME: Duration = Duration::from_secs(2);
const SUCCESS_SETTLE_TIME: Duration = Duration::from_millis(400);
const EVENT_POLL_INTERVAL: Duration = Duration::from_millis(20);

const COLOR_BACKGROUND: u32 = 0x00FF_FFFF;
const COLOR_ACCENT: u32 = 0x00FD_D835;
const COLOR_TEXT: u32 = 0x0017_2033;
const COLOR_MUTED: u32 = 0x0060_708A;
const COLOR_ERROR: u32 = 0x00BD_2F2F;
const COLOR_BUTTON: u32 = 0x0025_63EB;

const UI_FONT_PATHS: [&str; 3] = [
    "/usr/share/fonts/chromeos/noto/NotoSans-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
];
const UI_TEXT_ALPHAS: [u32; 4] = [64, 128, 192, 255];

const RETRY_BUTTON: HitBox = HitBox::new(226, 178, 110, 32);
const CLOSE_BUTTON: HitBox = HitBox::new(348, 178, 108, 32);

x11rb::atom_manager! {
    Atoms: AtomsCookie {
        WM_PROTOCOLS,
        WM_DELETE_WINDOW,
        _NET_WM_NAME,
        _NET_WM_PID,
        _NET_WM_WINDOW_TYPE,
        _NET_WM_WINDOW_TYPE_NORMAL,
        _NET_STARTUP_ID,
        UTF8_STRING,
    }
}

#[derive(Clone, Copy)]
struct HitBox {
    x: i16,
    y: i16,
    width: u16,
    height: u16,
}

impl HitBox {
    const fn new(x: i16, y: i16, width: u16, height: u16) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }

    fn contains(self, x: i16, y: i16) -> bool {
        let right = self.x.saturating_add_unsigned(self.width);
        let bottom = self.y.saturating_add_unsigned(self.height);
        x >= self.x && x < right && y >= self.y && y < bottom
    }

    const fn rectangle(self) -> Rectangle {
        Rectangle {
            x: self.x,
            y: self.y,
            width: self.width,
            height: self.height,
        }
    }
}

#[derive(Clone, Copy)]
struct Layout {
    scale: f64,
    screen_width: u16,
    screen_height: u16,
    font_pixel_width: u16,
    font_pixel_height: u16,
}

impl Layout {
    fn for_screen(
        width_in_pixels: u16,
        height_in_pixels: u16,
        width_in_millimeters: u16,
        height_in_millimeters: u16,
    ) -> Self {
        let horizontal_dpi = dpi(width_in_pixels, width_in_millimeters);
        let vertical_dpi = dpi(height_in_pixels, height_in_millimeters);
        let dpi = horizontal_dpi.zip(vertical_dpi).map_or_else(
            || horizontal_dpi.or(vertical_dpi).unwrap_or(BASE_DPI),
            |(horizontal, vertical)| horizontal.midpoint(vertical),
        );
        let scale = (dpi / BASE_DPI).clamp(1.0, 3.0);

        Self {
            scale,
            screen_width: width_in_pixels,
            screen_height: height_in_pixels,
            font_pixel_width: scaled_f64(1.25, scale).max(1),
            font_pixel_height: scaled_f64(2.0, scale).max(2),
        }
    }

    fn x(self, value: i16) -> i16 {
        scaled_i16(value, self.scale)
    }

    fn y(self, value: i16) -> i16 {
        scaled_i16(value, self.scale)
    }

    fn size(self, value: u16) -> u16 {
        scaled_u16(value, self.scale)
    }

    fn hit_box(self, bounds: HitBox) -> HitBox {
        HitBox::new(
            self.x(bounds.x),
            self.y(bounds.y),
            self.size(bounds.width),
            self.size(bounds.height),
        )
    }

    fn dimensions(self, state: &ViewState) -> (u16, u16) {
        match state {
            ViewState::Working => (
                self.size(BASE_WORKING_WIDTH),
                self.size(BASE_WORKING_HEIGHT),
            ),
            ViewState::Failed(_) => (
                self.size(BASE_FAILURE_WIDTH),
                self.size(BASE_FAILURE_HEIGHT),
            ),
        }
    }
}

enum WorkerMessage {
    Finished(Result<(), String>),
}

enum ViewState {
    Working,
    Failed(String),
}

struct Graphics {
    layout: Layout,
    ui_font: Option<Font>,
    ui_text: [Gcontext; UI_TEXT_ALPHAS.len()],
    text: Gcontext,
    muted: Gcontext,
    error: Gcontext,
    accent: Gcontext,
    button: Gcontext,
    button_text: Gcontext,
}

pub fn run_launcher_window() -> Result<(), String> {
    let (connection, screen_number) = x11rb::connect(None)
        .map_err(|error| format!("could not open the Linux display: {error}"))?;
    let screen = &connection.setup().roots[screen_number];
    let layout = Layout::for_screen(
        screen.width_in_pixels,
        screen.height_in_pixels,
        screen.width_in_millimeters,
        screen.height_in_millimeters,
    );
    let window = connection
        .generate_id()
        .map_err(|error| format!("could not allocate the launcher window: {error}"))?;
    let initial_state = ViewState::Working;
    let (width, height) = layout.dimensions(&initial_state);
    let x = centered_coordinate(screen.width_in_pixels, width);
    let y = centered_coordinate(screen.height_in_pixels, height);
    let attributes = CreateWindowAux::new()
        .background_pixel(COLOR_BACKGROUND)
        .event_mask(EventMask::EXPOSURE | EventMask::STRUCTURE_NOTIFY | EventMask::BUTTON_PRESS);
    connection
        .create_window(
            COPY_DEPTH_FROM_PARENT,
            window,
            screen.root,
            x,
            y,
            width,
            height,
            0,
            WindowClass::INPUT_OUTPUT,
            0,
            &attributes,
        )
        .map_err(|error| format!("could not create the launcher window: {error}"))?
        .check()
        .map_err(|error| format!("could not create the launcher window: {error}"))?;

    let atoms = Atoms::new(&connection)
        .map_err(|error| format!("could not prepare launcher window properties: {error}"))?
        .reply()
        .map_err(|error| format!("could not prepare launcher window properties: {error}"))?;
    set_window_properties(&connection, window, &atoms)?;
    let graphics = create_graphics(&connection, window, layout)?;

    connection
        .map_window(window)
        .map_err(|error| format!("could not show the launcher window: {error}"))?
        .check()
        .map_err(|error| format!("could not show the launcher window: {error}"))?;
    connection
        .flush()
        .map_err(|error| format!("could not show the launcher window: {error}"))?;

    let mapped_at = Instant::now();
    let (sender, receiver) = mpsc::channel();
    start_launch_attempt(sender.clone());
    let mut state = initial_state;
    let mut close_at = None;
    draw(&connection, window, &graphics, &state)?;

    loop {
        drain_worker_messages(
            &receiver,
            &mut state,
            &mut close_at,
            mapped_at,
            &connection,
            window,
            &graphics,
        )?;
        if close_at.is_some_and(|deadline| Instant::now() >= deadline) {
            return Ok(());
        }

        while let Some(event) = connection
            .poll_for_event()
            .map_err(|error| format!("launcher window event failed: {error}"))?
        {
            match event {
                Event::Expose(event) if event.count == 0 => {
                    draw(&connection, window, &graphics, &state)?;
                }
                Event::ButtonPress(event) => {
                    if handle_click(event, &state, &sender, graphics.layout) {
                        state = ViewState::Working;
                        close_at = None;
                        configure_for_state(&connection, window, graphics.layout, &state)?;
                        draw(&connection, window, &graphics, &state)?;
                    } else if matches!(state, ViewState::Failed(_))
                        && graphics
                            .layout
                            .hit_box(CLOSE_BUTTON)
                            .contains(event.event_x, event.event_y)
                    {
                        return Ok(());
                    }
                }
                Event::ClientMessage(event) => {
                    let data = event.data.as_data32();
                    if event.format == 32
                        && event.window == window
                        && data[0] == atoms.WM_DELETE_WINDOW
                    {
                        return Ok(());
                    }
                }
                Event::DestroyNotify(_) => return Ok(()),
                Event::Error(error) => {
                    return Err(format!("launcher window protocol error: {error:?}"));
                }
                _ => {}
            }
        }

        thread::sleep(EVENT_POLL_INTERVAL);
    }
}

fn start_launch_attempt(sender: Sender<WorkerMessage>) {
    thread::spawn(move || {
        let result = execute_launch(&SystemBackend, |_| {}).map(|_| ());
        let _ = sender.send(WorkerMessage::Finished(result));
    });
}

#[allow(clippy::too_many_arguments)]
fn drain_worker_messages<C: Connection>(
    receiver: &Receiver<WorkerMessage>,
    state: &mut ViewState,
    close_at: &mut Option<Instant>,
    mapped_at: Instant,
    connection: &C,
    window: Window,
    graphics: &Graphics,
) -> Result<(), String> {
    while let Ok(message) = receiver.try_recv() {
        match message {
            WorkerMessage::Finished(Ok(())) => {
                *close_at = Some(max(
                    mapped_at + MINIMUM_VISIBLE_TIME,
                    Instant::now() + SUCCESS_SETTLE_TIME,
                ));
            }
            WorkerMessage::Finished(Err(error)) => {
                *state = ViewState::Failed(error);
                configure_for_state(connection, window, graphics.layout, state)?;
            }
        }
        draw(connection, window, graphics, state)?;
    }
    Ok(())
}

fn configure_for_state<C: Connection>(
    connection: &C,
    window: Window,
    layout: Layout,
    state: &ViewState,
) -> Result<(), String> {
    let (width, height) = layout.dimensions(state);
    let x = centered_coordinate(layout.screen_width, width);
    let y = centered_coordinate(layout.screen_height, height);
    connection
        .configure_window(
            window,
            &ConfigureWindowAux::new()
                .x(i32::from(x))
                .y(i32::from(y))
                .width(u32::from(width))
                .height(u32::from(height)),
        )
        .map_err(|error| draw_error(&error))?;
    Ok(())
}

fn handle_click(
    event: ButtonPressEvent,
    state: &ViewState,
    sender: &Sender<WorkerMessage>,
    layout: Layout,
) -> bool {
    if event.detail != 1 || !matches!(state, ViewState::Failed(_)) {
        return false;
    }
    if layout
        .hit_box(RETRY_BUTTON)
        .contains(event.event_x, event.event_y)
    {
        start_launch_attempt(sender.clone());
        return true;
    }
    false
}

fn set_window_properties<C: Connection>(
    connection: &C,
    window: Window,
    atoms: &Atoms,
) -> Result<(), String> {
    let title = b"Launching...";
    connection
        .change_property8(
            PropMode::REPLACE,
            window,
            AtomEnum::WM_NAME,
            AtomEnum::STRING,
            title,
        )
        .map_err(|error| property_error(&error))?;
    connection
        .change_property8(
            PropMode::REPLACE,
            window,
            atoms._NET_WM_NAME,
            atoms.UTF8_STRING,
            title,
        )
        .map_err(|error| property_error(&error))?;
    connection
        .change_property8(
            PropMode::REPLACE,
            window,
            AtomEnum::WM_CLASS,
            AtomEnum::STRING,
            format!("{APPLICATION_ID}\0{APPLICATION_ID}\0").as_bytes(),
        )
        .map_err(|error| property_error(&error))?;
    connection
        .change_property32(
            PropMode::REPLACE,
            window,
            atoms.WM_PROTOCOLS,
            AtomEnum::ATOM,
            &[atoms.WM_DELETE_WINDOW],
        )
        .map_err(|error| property_error(&error))?;
    connection
        .change_property32(
            PropMode::REPLACE,
            window,
            atoms._NET_WM_PID,
            AtomEnum::CARDINAL,
            &[std::process::id()],
        )
        .map_err(|error| property_error(&error))?;
    connection
        .change_property32(
            PropMode::REPLACE,
            window,
            atoms._NET_WM_WINDOW_TYPE,
            AtomEnum::ATOM,
            &[atoms._NET_WM_WINDOW_TYPE_NORMAL],
        )
        .map_err(|error| property_error(&error))?;
    if let Ok(startup_id) = env::var("DESKTOP_STARTUP_ID") {
        if !startup_id.is_empty() {
            connection
                .change_property8(
                    PropMode::REPLACE,
                    window,
                    atoms._NET_STARTUP_ID,
                    atoms.UTF8_STRING,
                    startup_id.as_bytes(),
                )
                .map_err(|error| property_error(&error))?;
        }
    }
    Ok(())
}

fn property_error(error: &x11rb::errors::ConnectionError) -> String {
    format!("could not configure launcher window: {error}")
}

fn create_graphics<C: Connection>(
    connection: &C,
    window: Window,
    layout: Layout,
) -> Result<Graphics, String> {
    Ok(Graphics {
        layout,
        ui_font: load_ui_font(),
        ui_text: UI_TEXT_ALPHAS
            .map(|alpha| {
                create_gc(
                    connection,
                    window,
                    blended_color(COLOR_TEXT, COLOR_BACKGROUND, alpha),
                )
            })
            .into_iter()
            .collect::<Result<Vec<_>, _>>()?
            .try_into()
            .map_err(|_| "could not prepare launcher text graphics".to_owned())?,
        text: create_gc(connection, window, COLOR_TEXT)?,
        muted: create_gc(connection, window, COLOR_MUTED)?,
        error: create_gc(connection, window, COLOR_ERROR)?,
        accent: create_gc(connection, window, COLOR_ACCENT)?,
        button: create_gc(connection, window, COLOR_BUTTON)?,
        button_text: create_gc(connection, window, COLOR_BACKGROUND)?,
    })
}

fn load_ui_font() -> Option<Font> {
    UI_FONT_PATHS.iter().find_map(|path| {
        fs::read(path)
            .ok()
            .and_then(|bytes| Font::from_bytes(bytes, FontSettings::default()).ok())
    })
}

fn blended_color(foreground: u32, background: u32, alpha: u32) -> u32 {
    let blend_channel = |shift| {
        let foreground = (foreground >> shift) & 0xff_u32;
        let background = (background >> shift) & 0xff_u32;
        (foreground * alpha + background * (255_u32 - alpha) + 127_u32) / 255_u32
    };
    (blend_channel(16) << 16) | (blend_channel(8) << 8) | blend_channel(0)
}

fn create_gc<C: Connection>(
    connection: &C,
    window: Window,
    foreground: u32,
) -> Result<Gcontext, String> {
    let gc = connection
        .generate_id()
        .map_err(|error| format!("could not allocate launcher graphics: {error}"))?;
    let attributes = CreateGCAux::new().foreground(foreground);
    connection
        .create_gc(gc, window, &attributes)
        .map_err(|error| format!("could not create launcher graphics: {error}"))?
        .check()
        .map_err(|error| format!("could not create launcher graphics: {error}"))?;
    Ok(gc)
}

fn draw<C: Connection>(
    connection: &C,
    window: Window,
    graphics: &Graphics,
    state: &ViewState,
) -> Result<(), String> {
    let layout = graphics.layout;
    let (width, height) = layout.dimensions(state);
    connection
        .clear_area(false, window, 0, 0, width, height)
        .map_err(|error| draw_error(&error))?;

    match state {
        ViewState::Working => {
            draw_working(connection, window, graphics)?;
        }
        ViewState::Failed(error) => {
            connection
                .poly_fill_rectangle(
                    window,
                    graphics.accent,
                    &[
                        layout
                            .hit_box(HitBox::new(0, 0, BASE_FAILURE_WIDTH, 10))
                            .rectangle(),
                        layout.hit_box(HitBox::new(24, 36, 52, 52)).rectangle(),
                    ],
                )
                .map_err(|error| draw_error(&error))?;
            draw_text(connection, window, graphics, graphics.text, 32, 52, "200")?;
            draw_text(
                connection,
                window,
                graphics,
                graphics.text,
                92,
                39,
                "200 OK",
            )?;
            draw_text(
                connection,
                window,
                graphics,
                graphics.error,
                92,
                67,
                "200 OK could not open.",
            )?;
            for (index, line) in wrap_error(error, 37).into_iter().take(4).enumerate() {
                let y = 98 + i16::try_from(index).unwrap_or(0) * 18;
                draw_text(connection, window, graphics, graphics.muted, 24, y, &line)?;
            }
            draw_button(connection, window, graphics, RETRY_BUTTON, "Try Again")?;
            draw_button(connection, window, graphics, CLOSE_BUTTON, "Close")?;
        }
    }

    connection.flush().map_err(|error| draw_error(&error))
}

fn draw_working<C: Connection>(
    connection: &C,
    window: Window,
    graphics: &Graphics,
) -> Result<(), String> {
    let layout = graphics.layout;
    connection
        .poly_fill_rectangle(
            window,
            graphics.accent,
            &[layout
                .hit_box(HitBox::new(0, 0, BASE_WORKING_WIDTH, 6))
                .rectangle()],
        )
        .map_err(|error| draw_error(&error))?;
    connection
        .poly_fill_arc(
            window,
            graphics.accent,
            &[scaled_arc(layout, 30, 25, 46, 46)],
        )
        .map_err(|error| draw_error(&error))?;
    connection
        .poly_fill_arc(
            window,
            graphics.text,
            &[
                scaled_arc(layout, 42, 45, 5, 5),
                scaled_arc(layout, 51, 45, 5, 5),
                scaled_arc(layout, 60, 45, 5, 5),
            ],
        )
        .map_err(|error| draw_error(&error))?;
    draw_ui_text(connection, window, graphics, 92, 61, "Launching...")?;
    Ok(())
}

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss
)]
fn draw_ui_text<C: Connection>(
    connection: &C,
    window: Window,
    graphics: &Graphics,
    x: i16,
    baseline: i16,
    text: &str,
) -> Result<(), String> {
    let Some(font) = &graphics.ui_font else {
        return draw_text(
            connection,
            window,
            graphics,
            graphics.text,
            x,
            baseline - 21,
            text,
        );
    };
    let layout = graphics.layout;
    let pixel_size = f32::from(layout.size(20));
    let mut pen_x = f32::from(layout.x(x));
    let baseline = f32::from(layout.y(baseline));
    let mut rectangles: [Vec<Rectangle>; UI_TEXT_ALPHAS.len()] =
        std::array::from_fn(|_| Vec::new());

    for character in text.chars().take(80) {
        let (metrics, bitmap) = font.rasterize(character, pixel_size);
        let glyph_x = pen_x + metrics.xmin as f32;
        let glyph_y = baseline - metrics.height as f32 - metrics.ymin as f32;
        for (index, alpha) in bitmap.into_iter().enumerate() {
            if alpha == 0 || metrics.width == 0 {
                continue;
            }
            let column = index % metrics.width;
            let row = index / metrics.width;
            let pixel_x = (glyph_x + column as f32).round() as i16;
            let pixel_y = (glyph_y + row as f32).round() as i16;
            let level = usize::from(alpha.saturating_sub(1)) * UI_TEXT_ALPHAS.len() / 255;
            rectangles[level].push(Rectangle {
                x: pixel_x,
                y: pixel_y,
                width: 1,
                height: 1,
            });
        }
        pen_x += metrics.advance_width;
    }

    for (gc, rectangles) in graphics.ui_text.iter().zip(rectangles.iter()) {
        if !rectangles.is_empty() {
            connection
                .poly_fill_rectangle(window, *gc, rectangles)
                .map_err(|error| draw_error(&error))?;
        }
    }
    Ok(())
}

fn scaled_arc(layout: Layout, x: i16, y: i16, width: u16, height: u16) -> Arc {
    Arc {
        x: layout.x(x),
        y: layout.y(y),
        width: layout.size(width),
        height: layout.size(height),
        angle1: 0,
        angle2: 360 * 64,
    }
}

fn draw_button<C: Connection>(
    connection: &C,
    window: Window,
    graphics: &Graphics,
    bounds: HitBox,
    label: &str,
) -> Result<(), String> {
    let scaled_bounds = graphics.layout.hit_box(bounds);
    connection
        .poly_fill_rectangle(window, graphics.button, &[scaled_bounds.rectangle()])
        .map_err(|error| draw_error(&error))?;
    let text_width = text_pixel_width(graphics.layout, label);
    let text_height = graphics.layout.font_pixel_height.saturating_mul(8);
    let x = scaled_bounds.x.saturating_add_unsigned(
        scaled_bounds
            .width
            .saturating_sub(text_width)
            .saturating_div(2),
    );
    let y = scaled_bounds.y.saturating_add_unsigned(
        scaled_bounds
            .height
            .saturating_sub(text_height)
            .saturating_div(2),
    );
    draw_text_at_pixels(
        connection,
        window,
        graphics,
        graphics.button_text,
        x,
        y,
        label,
    )
}

fn draw_text<C: Connection>(
    connection: &C,
    window: Window,
    graphics: &Graphics,
    gc: Gcontext,
    x: i16,
    y: i16,
    text: &str,
) -> Result<(), String> {
    let layout = graphics.layout;
    draw_text_at_pixels(
        connection,
        window,
        graphics,
        gc,
        layout.x(x),
        layout.y(y),
        text,
    )
}

fn draw_text_at_pixels<C: Connection>(
    connection: &C,
    window: Window,
    graphics: &Graphics,
    gc: Gcontext,
    x: i16,
    y: i16,
    text: &str,
) -> Result<(), String> {
    let layout = graphics.layout;
    let mut rectangles = Vec::new();
    let mut character_offset = 0_u16;
    for character in text.chars().take(80) {
        let glyph = BASIC_FONTS
            .get(character)
            .or_else(|| BASIC_FONTS.get('?'))
            .unwrap_or([0; 8]);
        let bounds = glyph_column_bounds(glyph);
        if let Some((left, right)) = bounds {
            for (row, bits) in glyph.into_iter().enumerate() {
                for column in left..=right {
                    if bits & (1 << column) == 0 {
                        continue;
                    }
                    let row = u16::try_from(row).unwrap_or(0);
                    rectangles.push(Rectangle {
                        x: x.saturating_add_unsigned(character_offset)
                            .saturating_add_unsigned(
                                (column - left).saturating_mul(layout.font_pixel_width),
                            ),
                        y: y.saturating_add_unsigned(row.saturating_mul(layout.font_pixel_height)),
                        width: layout.font_pixel_width,
                        height: layout.font_pixel_height,
                    });
                }
            }
        }
        character_offset = character_offset.saturating_add(glyph_advance(layout, bounds));
    }
    connection
        .poly_fill_rectangle(window, gc, &rectangles)
        .map_err(|error| draw_error(&error))?;
    Ok(())
}

fn text_pixel_width(layout: Layout, text: &str) -> u16 {
    text.chars().take(80).fold(0_u16, |width, character| {
        let glyph = BASIC_FONTS
            .get(character)
            .or_else(|| BASIC_FONTS.get('?'))
            .unwrap_or([0; 8]);
        width.saturating_add(glyph_advance(layout, glyph_column_bounds(glyph)))
    })
}

fn glyph_column_bounds(glyph: [u8; 8]) -> Option<(u16, u16)> {
    let left = (0_u16..8).find(|column| {
        glyph
            .iter()
            .any(|bits| bits & (1 << usize::from(*column)) != 0)
    });
    let right = (0_u16..8).rev().find(|column| {
        glyph
            .iter()
            .any(|bits| bits & (1 << usize::from(*column)) != 0)
    });
    left.zip(right)
}

fn glyph_advance(layout: Layout, bounds: Option<(u16, u16)>) -> u16 {
    bounds.map_or_else(
        || layout.font_pixel_width.saturating_mul(4),
        |(left, right)| {
            right
                .saturating_sub(left)
                .saturating_add(2)
                .saturating_mul(layout.font_pixel_width)
        },
    )
}

fn draw_error(error: &x11rb::errors::ConnectionError) -> String {
    format!("could not draw the launcher window: {error}")
}

fn wrap_error(message: &str, width: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let mut current = String::new();
    for word in message.split_whitespace() {
        if current.is_empty() {
            current.push_str(word);
        } else if current.len() + 1 + word.len() <= width {
            current.push(' ');
            current.push_str(word);
        } else {
            lines.push(std::mem::take(&mut current));
            current.push_str(word);
        }
    }
    if !current.is_empty() {
        lines.push(current);
    }
    if lines.is_empty() {
        lines.push("Unknown launch error".to_owned());
    }
    lines
}

fn dpi(pixels: u16, millimeters: u16) -> Option<f64> {
    (millimeters > 0).then(|| f64::from(pixels) * 25.4 / f64::from(millimeters))
}

#[allow(clippy::cast_sign_loss)]
fn scaled_f64(value: f64, scale: f64) -> u16 {
    (value * scale).round().clamp(1.0, f64::from(u16::MAX)) as u16
}

fn scaled_u16(value: u16, scale: f64) -> u16 {
    scaled_f64(f64::from(value), scale)
}

fn scaled_i16(value: i16, scale: f64) -> i16 {
    (f64::from(value) * scale)
        .round()
        .clamp(f64::from(i16::MIN), f64::from(i16::MAX)) as i16
}

fn centered_coordinate(screen: u16, window: u16) -> i16 {
    let offset = screen.saturating_sub(window) / 2;
    i16::try_from(offset).unwrap_or(i16::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hit_box_uses_half_open_edges() {
        let box_ = HitBox::new(10, 20, 30, 40);
        assert!(box_.contains(10, 20));
        assert!(box_.contains(39, 59));
        assert!(!box_.contains(40, 59));
        assert!(!box_.contains(39, 60));
    }

    #[test]
    fn wraps_errors_on_word_boundaries() {
        assert_eq!(
            wrap_error("one two three four", 9),
            ["one two", "three", "four"]
        );
    }

    #[test]
    fn scales_layout_for_chromeos_hidpi_display() {
        let layout = Layout::for_screen(3840, 2160, 424, 238);
        let (working_width, working_height) = layout.dimensions(&ViewState::Working);
        let (failure_width, failure_height) = layout.dimensions(&ViewState::Failed(String::new()));
        assert!((763..=770).contains(&working_width));
        assert!((228..=233).contains(&working_height));
        assert!((1_145..=1_155).contains(&failure_width));
        assert!((543..=550).contains(&failure_height));
        assert_eq!(layout.font_pixel_width, 3);
        assert_eq!(layout.font_pixel_height, 5);
    }

    #[test]
    fn defaults_to_one_x_for_missing_physical_dimensions() {
        let layout = Layout::for_screen(1920, 1080, 0, 0);
        assert_eq!(
            layout.dimensions(&ViewState::Working),
            (BASE_WORKING_WIDTH, BASE_WORKING_HEIGHT)
        );
    }

    #[test]
    fn embedded_text_uses_proportional_glyph_widths() {
        let layout = Layout::for_screen(1920, 1080, 0, 0);
        assert!(text_pixel_width(layout, "III") < text_pixel_width(layout, "WWW"));
    }

    #[test]
    fn text_color_blending_preserves_endpoints() {
        assert_eq!(
            blended_color(COLOR_TEXT, COLOR_BACKGROUND, 0),
            COLOR_BACKGROUND
        );
        assert_eq!(blended_color(COLOR_TEXT, COLOR_BACKGROUND, 255), COLOR_TEXT);
    }
}
