#!/usr/bin/env bash
#
# setup-emulator.sh - One-time Android emulator setup without Android Studio
#
# Creates a lightweight Android dev environment for Ok200 daemon work.
# Tested on: macOS (Apple Silicon), Linux (x86_64)
#
set -euo pipefail

# Configuration
SDK_ROOT="${ANDROID_HOME:-$HOME/Android/Sdk}"
AVD_NAME="ok200-dev"
AVD_NAME_TABLET="ok200-tablet"
AVD_NAME_PLAYSTORE="ok200-playstore"
API_LEVEL="34"
CMDLINE_TOOLS_VERSION="11076708"  # Update if needed

# Detect platform
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
    Darwin)
        PLATFORM="mac"
        case "$ARCH" in
            arm64) SYSTEM_IMAGE="arm64-v8a" ;;
            x86_64) SYSTEM_IMAGE="x86_64" ;;
            *) echo "Unsupported Mac architecture: $ARCH"; exit 1 ;;
        esac
        ;;
    Linux)
        PLATFORM="linux"
        case "$ARCH" in
            x86_64) SYSTEM_IMAGE="x86_64" ;;
            aarch64) SYSTEM_IMAGE="arm64-v8a" ;;
            *) echo "Unsupported Linux architecture: $ARCH"; exit 1 ;;
        esac
        ;;
    *)
        echo "Unsupported OS: $OS"
        exit 1
        ;;
esac

echo "=== Ok200 Android Emulator Setup ==="
echo "Platform: $PLATFORM ($ARCH)"
echo "SDK location: $SDK_ROOT"
echo "System image: android-$API_LEVEL;google_apis;$SYSTEM_IMAGE"
echo ""

# Create SDK directory
mkdir -p "$SDK_ROOT"

# Download cmdline-tools if not present
CMDLINE_TOOLS="$SDK_ROOT/cmdline-tools/latest"
if [[ ! -d "$CMDLINE_TOOLS" ]]; then
    echo ">>> Downloading Android command-line tools..."
    
    ZIP_URL="https://dl.google.com/android/repository/commandlinetools-${PLATFORM}-${CMDLINE_TOOLS_VERSION}_latest.zip"
    ZIP_FILE="/tmp/cmdline-tools.zip"
    
    curl -L -o "$ZIP_FILE" "$ZIP_URL"
    
    # Extract to temp, then move to correct structure
    TEMP_EXTRACT="/tmp/cmdline-tools-extract"
    rm -rf "$TEMP_EXTRACT"
    unzip -q "$ZIP_FILE" -d "$TEMP_EXTRACT"
    
    # Google's zip has cmdline-tools/ inside, we need cmdline-tools/latest/
    mkdir -p "$SDK_ROOT/cmdline-tools"
    mv "$TEMP_EXTRACT/cmdline-tools" "$CMDLINE_TOOLS"
    
    rm -rf "$ZIP_FILE" "$TEMP_EXTRACT"
    echo "    Installed to $CMDLINE_TOOLS"
else
    echo ">>> Command-line tools already installed"
fi

# Set up paths
export ANDROID_HOME="$SDK_ROOT"
export PATH="$CMDLINE_TOOLS/bin:$SDK_ROOT/platform-tools:$SDK_ROOT/emulator:$PATH"

SDKMANAGER="$CMDLINE_TOOLS/bin/sdkmanager"
AVDMANAGER="$CMDLINE_TOOLS/bin/avdmanager"

# Accept licenses non-interactively
echo ""
echo ">>> Accepting SDK licenses..."
yes | "$SDKMANAGER" --licenses > /dev/null 2>&1 || true

# Install required components
echo ""
echo ">>> Installing SDK components..."
"$SDKMANAGER" --install \
    "platform-tools" \
    "emulator" \
    "platforms;android-$API_LEVEL" \
    "system-images;android-$API_LEVEL;google_apis;$SYSTEM_IMAGE" \
    "system-images;android-$API_LEVEL;google_apis_playstore;$SYSTEM_IMAGE"

# Create AVD if it doesn't exist
echo ""
if "$AVDMANAGER" list avd -c | grep -q "^${AVD_NAME}$"; then
    echo ">>> AVD '$AVD_NAME' already exists"
else
    echo ">>> Creating AVD '$AVD_NAME'..."
    echo "no" | "$AVDMANAGER" create avd \
        --name "$AVD_NAME" \
        --package "system-images;android-$API_LEVEL;google_apis;$SYSTEM_IMAGE" \
        --device "pixel_6"
    
    # Configure AVD for performance
    AVD_CONFIG="$HOME/.android/avd/${AVD_NAME}.avd/config.ini"
    if [[ -f "$AVD_CONFIG" ]]; then
        # Ensure reasonable defaults
        cat >> "$AVD_CONFIG" << 'EOF'
hw.ramSize=2048
disk.dataPartition.size=4G
hw.keyboard=yes
hw.gpu.enabled=yes
hw.gpu.mode=auto
EOF
        echo "    Configured with 2GB RAM, 4GB storage"
    fi
fi

# Create tablet AVD if it doesn't exist
echo ""
if "$AVDMANAGER" list avd -c | grep -q "^${AVD_NAME_TABLET}$"; then
    echo ">>> AVD '$AVD_NAME_TABLET' already exists"
else
    echo ">>> Creating AVD '$AVD_NAME_TABLET' (tablet)..."
    echo "no" | "$AVDMANAGER" create avd \
        --name "$AVD_NAME_TABLET" \
        --package "system-images;android-$API_LEVEL;google_apis;$SYSTEM_IMAGE" \
        --device "pixel_tablet"

    # Configure tablet AVD for performance
    AVD_CONFIG_TABLET="$HOME/.android/avd/${AVD_NAME_TABLET}.avd/config.ini"
    if [[ -f "$AVD_CONFIG_TABLET" ]]; then
        cat >> "$AVD_CONFIG_TABLET" << 'EOF'
hw.ramSize=2048
disk.dataPartition.size=4G
hw.keyboard=yes
hw.gpu.enabled=yes
hw.gpu.mode=auto
EOF
        echo "    Configured with 2GB RAM, 4GB storage"
    fi
fi

# Create Play Store AVD if it doesn't exist
echo ""
if "$AVDMANAGER" list avd -c | grep -q "^${AVD_NAME_PLAYSTORE}$"; then
    echo ">>> AVD '$AVD_NAME_PLAYSTORE' already exists"
else
    echo ">>> Creating AVD '$AVD_NAME_PLAYSTORE' (phone with Play Store)..."
    echo "no" | "$AVDMANAGER" create avd \
        --name "$AVD_NAME_PLAYSTORE" \
        --package "system-images;android-$API_LEVEL;google_apis_playstore;$SYSTEM_IMAGE" \
        --device "pixel_6"

    # Configure Play Store AVD for performance
    AVD_CONFIG_PLAYSTORE="$HOME/.android/avd/${AVD_NAME_PLAYSTORE}.avd/config.ini"
    if [[ -f "$AVD_CONFIG_PLAYSTORE" ]]; then
        cat >> "$AVD_CONFIG_PLAYSTORE" << 'EOF'
hw.ramSize=2048
disk.dataPartition.size=4G
hw.keyboard=yes
hw.gpu.enabled=yes
hw.gpu.mode=auto
EOF
        echo "    Configured with 2GB RAM, 4GB storage"
    fi
fi

# Print shell configuration
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Add to your shell profile (~/.zshrc or ~/.bashrc):"
echo ""
echo "    export ANDROID_HOME=\"$SDK_ROOT\""
echo "    export PATH=\"\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools:\$ANDROID_HOME/emulator:\$PATH\""
echo ""
echo "Then run:"
echo "    source ~/.zshrc  # or restart terminal"
echo ""
echo "Quick start:"
echo "    ./emu-start.sh                        # Start phone emulator"
echo "    AVD_NAME=ok200-tablet ./emu-start.sh    # Start tablet emulator"
echo "    AVD_NAME=ok200-playstore ./emu-start.sh # Start phone with Play Store"
echo "    ./emu-install.sh                      # Build and install APK"
echo "    ./emu-logs.sh                         # View filtered logs"
echo "    ./emu-stop.sh                         # Stop emulator"
echo ""
echo "AVDs created:"
echo "    ok200-dev       (Pixel 6 - phone)"
echo "    ok200-tablet    (Pixel Tablet)"
echo "    ok200-playstore (Pixel 6 - phone with Play Store)"
echo ""
