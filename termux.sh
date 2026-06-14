#!/usr/bin/env bash

# 切换到脚本所在目录
cd "$(dirname "$0")"

echo "[NikaForge] Starting check process..."

FIRST_RUN=0
NEED_INSTALL=0

# ================= 1. check node_modules
if [ ! -d "backend/node_modules" ]; then
    echo "[NikaForge] node_modules not found. First run detected."
    FIRST_RUN=1
    NEED_INSTALL=1
fi

# ================= 2. check git
if [ -d ".git" ]; then
    if command -v git >/dev/null 2>&1; then
        echo "[NikaForge] Git repository detected. Checking for updates..."
        git -c http.sslVerify=false fetch >/dev/null 2>&1
        if git status -uno | grep -q "Your branch is behind"; then
            echo "[NikaForge] New version found! Pulling code..."
            git -c http.sslVerify=false pull
            echo "========================================================"
            echo "[NikaForge] Update successfully downloaded!"
            echo "Please restart termux.sh to apply the latest updates."
            echo "========================================================"
            exit 0
        else
            echo "[NikaForge] Extension is already up to date."
        fi
    else
        echo "[NikaForge] Git is not installed. Skipping update check."
    fi
else
    echo "[NikaForge] Not a Git clone. Skipping update check."
fi

# ================= 3. check bun
check_bun() {
    command -v bun >/dev/null 2>&1
}

if ! check_bun; then
    echo "[NikaForge] Bun is not installed. Attempting native installation via Termux User Repository (TUR)..."
    pkg update -y
    pkg install -y tur-repo
    pkg install -y bun
    
    if ! check_bun; then
        echo "========================================================"
        echo "[NikaForge] ERROR: Failed to install Bun environment!"
        echo "[NikaForge] Bun is mandatory to run NikaForge backend."
        echo "[NikaForge] Please install Bun manually by running:"
        echo "  pkg update -y && pkg install -y tur-repo && pkg install -y bun"
        echo "========================================================"
        exit 1
    fi
else
    echo "[NikaForge] Bun environment is ready."
fi

# ================= 4. install dependencies
if [ "$NEED_INSTALL" -eq 1 ]; then
    echo "[NikaForge] Installing and updating dependencies..."
    cd backend || exit 1
    
    RETRY_COUNT=0
    SUCCESS=0
    while [ $RETRY_COUNT -lt 3 ]; do
        if bun install; then
            SUCCESS=1
            break
        fi
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo "[NikaForge] Install failed. Retrying ($RETRY_COUNT/3)..."
        sleep 2
    done
    
    if [ $SUCCESS -eq 0 ]; then
        echo "========================================================"
        echo "[NikaForge] ERROR: Failed to install dependencies after 3 attempts!"
        echo "[NikaForge] Attempting fallback to domestic npm registry (npmmirror)..."
        echo "========================================================"
        
        if npm install --registry=https://registry.npmmirror.com; then
            echo "[NikaForge] Successfully installed using domestic registry!"
        else
            echo "[NikaForge] Fallback install also failed. Please check network manually and try again."
            cd ..
            exit 1
        fi
    else
        echo "[NikaForge] Dependencies are ready!"
    fi
    cd ..
fi

# ================= 5. shortcut (Skipped on Unix/Termux)
if [ "$FIRST_RUN" -eq 1 ]; then
    echo "[NikaForge] Initial setup complete."
fi

# ================= 6. run server
echo "----------------------------------------------------"
echo "[NikaForge] Starting backend server. PLEASE DO NOT CLOSE THIS WINDOW."
echo "----------------------------------------------------"
cd backend || exit 1
bun run server.ts
