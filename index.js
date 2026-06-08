// NikaForge SillyTavern 扩展主脚本
import { saveSettingsDebounced } from "../../../../script.js";
import { extension_settings, getContext } from "../../../extensions.js";

const extensionName = "NikaForge-ide";

// 自动获取当前扩展的 HTTP 路径
const extensionFolderPath = import.meta.url.substring(0, import.meta.url.lastIndexOf('/'));

function createUI() {
    const html = `
    <div id="NikaForge-container" style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 15px; margin-top: 15px;">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>💻 妮卡工坊</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="NikaForge-section" style="padding: 10px 0;">
                    
                    <!-- 状态监控灯 -->
                    <div id="NikaForge-health-status" style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 12px; font-size: 13px; font-weight: bold; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px;">
                        <div id="NikaForge-health-dot" style="width: 10px; height: 10px; border-radius: 50%; background-color: #ff4444; box-shadow: 0 0 8px #ff4444; transition: all 0.3s ease;"></div>
                        <span id="NikaForge-health-text" style="color: #ff4444; transition: all 0.3s ease;">连接中...</span>
                    </div>

                    <div class="NikaForge-btn-row">
                        <button id="NikaForge-open-ide-btn" class="NikaForge-menu-btn" disabled>
                            💻 打开 妮卡工坊
                        </button>
                    </div>
                    
                    <!-- 警告提示 -->
                    <div id="NikaForge-health-help" style="margin-top: 8px; font-size: 11px; color: #ff8888; text-align: center; line-height: 1.4;">
                        检测到扩展后端未运行，请前往 extensions/NikaForge 目录下双击运行 start.bat 或者桌面的NikaForge快捷键
                    </div>
                    
                    <!-- 原来的描述文字 (成功时显示) -->
                    <div id="NikaForge-help-desc" style="display: none; margin-top: 8px; font-size: 11px; opacity: 0.7; text-align: center; line-height: 1.4;">
                        启动妮卡工坊，创建全屏游戏卡！（建议先在妮卡工作室中创建好完整的世界书）
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    $('#extensions_settings').append(html);
    bindEvents();

    // 启动状态轮询
    startHealthCheck();
}

let healthCheckInterval = null;

function startHealthCheck() {
    const checkBackendHealth = () => {
        const dot = $('#NikaForge-health-dot');
        const text = $('#NikaForge-health-text');
        const btn = $('#NikaForge-open-ide-btn');
        const help = $('#NikaForge-health-help');
        const desc = $('#NikaForge-help-desc');

        fetch('http://127.0.0.1:3456/api/health')
            .then(res => {
                if (res.ok) {
                    dot.css({ 'background-color': '#44ff44', 'box-shadow': '0 0 8px #44ff44' });
                    text.css('color', '#44ff44').text('后端已连接');
                    btn.prop('disabled', false);
                    help.hide();
                    desc.show();
                } else {
                    throw new Error('Not OK');
                }
            })
            .catch(() => {
                dot.css({ 'background-color': '#ff4444', 'box-shadow': '0 0 8px #ff4444' });
                text.css('color', '#ff4444').text('后端未连接');
                btn.prop('disabled', true);
                help.show();
                desc.hide();
            });
    };

    // 立即执行一次
    checkBackendHealth();
    // 之后每 3 秒轮询一次
    healthCheckInterval = setInterval(checkBackendHealth, 3000);
}

function bindEvents() {
    $('#NikaForge-open-ide-btn').on('click', () => {
        openNikaForgeIDE();
    });
}

function openNikaForgeIDE() {
    // 如果已经打开，直接返回
    if ($('#NikaForge-overlay').length > 0) return;

    // 创建全屏遮罩及 iframe 容器
    const overlay = $(`
    <div id="NikaForge-overlay" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 999999; background: #0a0a0c; display: flex; flex-direction: column; opacity: 0; transition: opacity 0.2s ease;">
        <!-- iframe 主体 -->
        <iframe src="${extensionFolderPath}/NikaForge.html" style="flex: 1; border: none; width: 100%; height: 100vh; background: #0a0a0c;"></iframe>
    </div>
    `);

    $('body').append(overlay);

    // 触发淡入动画
    setTimeout(() => {
        overlay.css('opacity', '1');
    }, 50);
}

// 初始化加载
jQuery(() => {
    // 注册设置占位
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    createUI();
    console.log("[NikaForge] 扩展加载成功，挂载路径:", extensionFolderPath);

    // 【超级同步重载】：自动选择在 NikaForge 编辑或创建的最新角色卡并开始聊天
    const autoSelectAvatar = localStorage.getItem('NikaForge_auto_select_avatar');
    if (autoSelectAvatar) {
        localStorage.removeItem('NikaForge_auto_select_avatar');
        console.log("[NikaForge] 检测到自动选择角色指令，头像 ID:", autoSelectAvatar);

        // 循环等候酒馆引擎加载就绪，然后实现高精度无缝选择切换
        const interval = setInterval(() => {
            if (window.characters && window.characters.length > 0 && typeof window.selectCharacterById === 'function') {
                clearInterval(interval);
                const chid = window.characters.findIndex(c => c.avatar === autoSelectAvatar);
                if (chid !== -1) {
                    console.log("[NikaForge] 自动切换至目标角色卡中，ID:", chid);
                    window.selectCharacterById(chid).catch(e => console.error(e));
                }
            }
        }, 150);

        // 5秒后自动关闭保底以释放定时器
        setTimeout(() => clearInterval(interval), 5000);
    }
});

// 核心中继器：监听来自 IDE iframe 预览的 slash 命令行请求，在原汁原味的宿主上下文执行
window.addEventListener('message', async (event) => {
    if (event.data && event.data.action === 'NikaForge_execute_slash_command') {
        const { command, id } = event.data;
        console.log("[NikaForge] 中继监听器：收到执行 slash 命令请求:", command);
        try {
            const context = getContext();
            if (context && typeof context.executeSlashCommands === 'function') {
                // 立即发送确认响应，证明中继器在线，命令已接单并开始运行
                event.source.postMessage({
                    action: 'NikaForge_execute_slash_command_status',
                    id: id,
                    status: 'executing'
                }, event.origin || '*');

                let result = await context.executeSlashCommands(command);

                // 智能结果解析：提取可能返回的酒馆 STscript 结果对象中的核心文本字段
                if (result && typeof result === 'object') {
                    console.log("[NikaForge] 中继命令返回结果为 object，进行智能字段提取:", result);
                    if (result.pipe !== undefined) {
                        result = result.pipe;
                    } else if (result.value !== undefined) {
                        result = result.value;
                    } else if (result.result !== undefined) {
                        result = result.result;
                    } else if (result.data !== undefined) {
                        result = result.data;
                    } else {
                        try {
                            result = JSON.stringify(result);
                        } catch (e) {
                            result = String(result);
                        }
                    }
                }

                event.source.postMessage({
                    action: 'NikaForge_execute_slash_command_response',
                    id: id,
                    success: true,
                    result: result || ''
                }, event.origin || '*');
            } else {
                throw new Error("酒馆宿主环境 executeSlashCommands 方法未定义或不可用");
            }
        } catch (error) {
            console.error("[NikaForge] 中继监听器：执行 slash 命令失败:", error);
            event.source.postMessage({
                action: 'NikaForge_execute_slash_command_response',
                id: id,
                success: false,
                error: error.message || String(error)
            }, event.origin || '*');
        }
    }
});
