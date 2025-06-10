import { homedir, platform } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { exec } from "node:child_process";
import readline from 'readline';

// Add this after your imports to define __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to configure initial filesystem access
async function configureFilesystemAccess() {
  const configDir = join(homedir(), '.claude-server-commander');
  const configFile = join(configDir, 'config.json');
  
  // Create config directory if it doesn't exist
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
    logToFile(`Created config directory: ${configDir}`);
  }
  
  // Default config
  let config = {
    blockedCommands: [
      "format", "mount", "umount", "mkfs", "fdisk", "dd", "sudo", "su", 
      "passwd", "adduser", "useradd", "usermod", "groupadd"
    ],
    defaultShell: platform() === 'win32' ? 'powershell.exe' : 'bash',
    allowedDirectories: []
  };
  
  // Load existing config if it exists
  if (existsSync(configFile)) {
    try {
      const existingConfig = JSON.parse(readFileSync(configFile, 'utf8'));
      config = { ...config, ...existingConfig };
      logToFile('Loaded existing configuration');
    } catch (error) {
      logToFile(`Error reading existing config: ${error}`, true);
    }
  }
  
  console.log("\n=== Claude Desktop Commander Filesystem Access Configuration ===");
  config.allowedDirectories = [homedir()];
  logToFile('Configured to restrict access to home directory only');
  console.log(`\nAccess restricted to home directory: ${homedir()}`);

  
  // Save the configuration
  try {
    writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
    logToFile('Saved configuration file');
    console.log(`Configuration saved to: ${configFile}`);
  } catch (error) {
    logToFile(`Error saving config: ${error}`, true);
    console.error(`Error saving configuration: ${error}`);
  }
  
  return config;
}

// Setup tracking (keeping this for logging purposes only)
let setupSteps = []; // Track setup progress
let setupStartTime = Date.now();

// Function to get npm version
async function getNpmVersion() {
  try {
    return new Promise((resolve, reject) => {
      exec('npm --version', (error, stdout, stderr) => {
        if (error) {
          resolve('unknown');
          return;
        }
        resolve(stdout.trim());
      });
    });
  } catch (error) {
    return 'unknown';
  }
}

const getVersion = async () => {
    try {
        const packageJson = await import('./package.json', { assert: { type: 'json' } });
        return packageJson.default.version;
    } catch {
        return 'unknown'
    }
};

// Function to detect shell environment
function detectShell() {
  // Check for Windows shells
  if (process.platform === 'win32') {
    if (process.env.TERM_PROGRAM === 'vscode') return 'vscode-terminal';
    if (process.env.WT_SESSION) return 'windows-terminal';
    if (process.env.SHELL?.includes('bash')) return 'git-bash';
    if (process.env.TERM?.includes('xterm')) return 'xterm-on-windows';
    if (process.env.ComSpec?.toLowerCase().includes('powershell')) return 'powershell';
    if (process.env.PROMPT) return 'cmd';

    // WSL detection
    if (process.env.WSL_DISTRO_NAME || process.env.WSLENV) {
      return `wsl-${process.env.WSL_DISTRO_NAME || 'unknown'}`;
    }

    return 'windows-unknown';
  }

  // Unix-based shells
  if (process.env.SHELL) {
    const shellPath = process.env.SHELL.toLowerCase();
    if (shellPath.includes('bash')) return 'bash';
    if (shellPath.includes('zsh')) return 'zsh';
    if (shellPath.includes('fish')) return 'fish';
    if (shellPath.includes('ksh')) return 'ksh';
    if (shellPath.includes('csh')) return 'csh';
    if (shellPath.includes('dash')) return 'dash';
    return `other-unix-${shellPath.split('/').pop()}`;
  }

  // Terminal emulators and IDE terminals
  if (process.env.TERM_PROGRAM) {
    return process.env.TERM_PROGRAM.toLowerCase();
  }

  return 'unknown-shell';
}

// Function to determine execution context
function getExecutionContext() {
  // Check if running from npx
  const isNpx = process.env.npm_lifecycle_event === 'npx' ||
                process.env.npm_execpath?.includes('npx') ||
                process.env._?.includes('npx') ||
                import.meta.url.includes('node_modules');

  // Check if installed globally
  const isGlobal = process.env.npm_config_global === 'true' ||
                   process.argv[1]?.includes('node_modules/.bin');

  // Check if it's run from a script in package.json
  const isNpmScript = !!process.env.npm_lifecycle_script;

  return {
    runMethod: isNpx ? 'npx' : (isGlobal ? 'global' : (isNpmScript ? 'npm_script' : 'direct')),
    isCI: !!process.env.CI || !!process.env.GITHUB_ACTIONS || !!process.env.TRAVIS || !!process.env.CIRCLECI,
    shell: detectShell()
  };
}

// Tracking step functions (keeping for logging purposes)
function addSetupStep(step, status = 'started', error = null) {
    const timestamp = Date.now();
    setupSteps.push({
        step,
        status,
        timestamp,
        timeFromStart: timestamp - setupStartTime,
        error: error ? error.message || String(error) : null
    });
    return setupSteps.length - 1; // Return the index for later updates
}

function updateSetupStep(index, status, error = null) {
    if (setupSteps[index]) {
        const timestamp = Date.now();
        setupSteps[index].status = status;
        setupSteps[index].completionTime = timestamp;
        setupSteps[index].timeFromStart = timestamp - setupStartTime;
        if (error) {
            setupSteps[index].error = error.message || String(error);
        }
    }
}

// Simple logging function to replace tracking
function logToFile(message, isError = false) {
    try {
        const logDir = join(homedir(), '.claude-server-commander');
        if (!existsSync(logDir)) {
            mkdirSync(logDir, { recursive: true });
        }
        
        const logFile = join(logDir, 'setup.log');
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${isError ? 'ERROR: ' : ''}${message}\n`;
        
        appendFileSync(logFile, logMessage);
        
        // Also log to console
        if (isError) {
            console.error(message);
        } else {
            console.log(message);
        }
    } catch (error) {
        // Fallback to console if file logging fails
        console.log(message);
        if (isError) {
            console.error('Error writing to log:', error);
        }
    }
}

// Function to check for debug mode argument
function isDebugMode() {
    return process.argv.includes('--debug');
}

// Determine OS and set appropriate config path
const os = platform();
const isWindows = os === 'win32';
let claudeConfigPath;

switch (os) {
    case 'win32':
        claudeConfigPath = join(process.env.APPDATA, 'Claude', 'claude_desktop_config.json');
        break;
    case 'darwin':
        claudeConfigPath = join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
        break;
    case 'linux':
        claudeConfigPath = join(homedir(), '.config', 'Claude', 'claude_desktop_config.json');
        break;
    default:
        // Fallback for other platforms
        claudeConfigPath = join(homedir(), '.claude_desktop_config.json');
}

async function execAsync(command) {
    const execStep = addSetupStep(`exec_${command.substring(0, 20)}...`);
    return new Promise((resolve, reject) => {
        // Use PowerShell on Windows for better Unicode support and consistency
        const actualCommand = isWindows
        ? `cmd.exe /c ${command}`
        : command;

        exec(actualCommand, { timeout: 10000 }, (error, stdout, stderr) => {
            if (error) {
                updateSetupStep(execStep, 'failed', error);
                reject(error);
                return;
            }
            updateSetupStep(execStep, 'completed');
            resolve({ stdout, stderr });
        });
    });
}

async function restartClaude() {
    const restartStep = addSetupStep('restart_claude');
    try {
        const platform = process.platform;
        logToFile(`Attempting to restart Claude on ${platform}`);

        // Try to kill Claude process first
        const killStep = addSetupStep('kill_claude_process');
        try {
            switch (platform) {
                case "win32":
                    await execAsync(
                        `taskkill /F /IM "Claude.exe"`,
                    );
                    break;
                case "darwin":
                    await execAsync(
                        `killall "Claude"`,
                    );
                    break;
                case "linux":
                    await execAsync(
                        `pkill -f "claude"`,
                    );
                    break;
            }
            updateSetupStep(killStep, 'completed');
            logToFile('Successfully killed Claude process');
        } catch (killError) {
            // It's okay if Claude isn't running - update step but continue
            updateSetupStep(killStep, 'no_process_found', killError);
            logToFile('Claude process not found or already terminated');
        }

        // Wait a bit to ensure process termination
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Try to start Claude
        const startStep = addSetupStep('start_claude_process');
        try {
            if (platform === "win32") {
                // Windows - note it won't actually start Claude
                logToFile("Windows: Claude restart skipped - requires manual restart");
                updateSetupStep(startStep, 'skipped');
            } else if (platform === "darwin") {
                await execAsync(`open -a "Claude"`);
                updateSetupStep(startStep, 'completed');
                logToFile(`Claude has been restarted.`);
            } else if (platform === "linux") {
                await execAsync(`claude`);
                logToFile(`Claude has been restarted.`);
                updateSetupStep(startStep, 'completed');
            }

            updateSetupStep(restartStep, 'completed');
        } catch (startError) {
            updateSetupStep(startStep, 'failed', startError);
            throw startError; // Re-throw to handle in the outer catch
        }
    } catch (error) {
        updateSetupStep(restartStep, 'failed', error);
        logToFile(`Failed to restart Claude: ${error}. Please restart it manually.`, true);
        logToFile(`If Claude Desktop is not installed use this link to download https://claude.ai/download`, true);
    }
}


// Main function to export for ESM compatibility
export default async function setup() {
    const setupStep = addSetupStep('main_setup');
    const debugMode = isDebugMode();

    // Print ASCII art for DESKTOP COMMANDER
    console.log('\n');
    console.log('██████╗ ███████╗███████╗██╗  ██╗████████╗ ██████╗ ██████╗     ██████╗ ██████╗ ███╗   ███╗███╗   ███╗ █████╗ ███╗   ██╗██████╗ ███████╗██████╗ ');
    console.log('██╔══██╗██╔════╝██╔════╝██║ ██╔╝╚══██╔══╝██╔═══██╗██╔══██╗   ██╔════╝██╔═══██╗████╗ ████║████╗ ████║██╔══██╗████╗  ██║██╔══██╗██╔════╝██╔══██╗');
    console.log('██║  ██║█████╗  ███████╗█████╔╝    ██║   ██║   ██║██████╔╝   ██║     ██║   ██║██╔████╔██║██╔████╔██║███████║██╔██╗ ██║██║  ██║█████╗  ██████╔╝');
    console.log('██║  ██║██╔══╝  ╚════██║██╔═██╗    ██║   ██║   ██║██╔═══╝    ██║     ██║   ██║██║╚██╔╝██║██║╚██╔╝██║██╔══██║██║╚██╗██║██║  ██║██╔══╝  ██╔══██╗');
    console.log('██████╔╝███████╗███████║██║  ██╗   ██║   ╚██████╔╝██║        ╚██████╗╚██████╔╝██║ ╚═╝ ██║██║ ╚═╝ ██║██║  ██║██║ ╚████║██████╔╝███████╗██║  ██║');
    console.log('╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝         ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝ ╚══════╝╚═╝  ╚═╝');
    console.log('\n');

    if (debugMode) {
        logToFile('Debug mode enabled. Will configure with Node.js inspector options.');
    }

    try {
        // Configure filesystem access
        await configureFilesystemAccess();
        
        // Close readline interface
        rl.close();
        
        // Check if config directory exists and create it if necessary
        const configDirStep = addSetupStep('check_config_directory');
        const configDir = dirname(claudeConfigPath);

        try {
            if (!existsSync(configDir)) {
                logToFile(`Creating config directory: ${configDir}`);
                mkdirSync(configDir, { recursive: true });
            }
            updateSetupStep(configDirStep, 'completed');
        } catch (dirError) {
            updateSetupStep(configDirStep, 'failed', dirError);
            throw new Error(`Failed to create config directory: ${dirError.message}`);
        }

        // Check if config file exists and create default if no
        const configFileStep = addSetupStep('check_config_file');
        let config;

        if (!existsSync(claudeConfigPath)) {
            logToFile(`Claude config file not found at: ${claudeConfigPath}`);
            logToFile('Creating default config file...');

            // Create default config with shell based on platform
            const defaultConfig = {
                "serverConfig": isWindows
                    ? {
                        "command": "cmd.exe",
                        "args": ["/c"]
                      }
                    : {
                        "command": "/bin/sh",
                        "args": ["-c"]
                      }
            };

            try {
                writeFileSync(claudeConfigPath, JSON.stringify(defaultConfig, null, 2));
                logToFile('Default config file created.');
                config = defaultConfig;
                updateSetupStep(configFileStep, 'created');
            } catch (writeError) {
                updateSetupStep(configFileStep, 'create_failed', writeError);
                throw new Error(`Failed to create config file: ${writeError.message}`);
            }
        } else {
            // Read existing config
            const readConfigStep = addSetupStep('read_config_file');
            try {
                const configData = readFileSync(claudeConfigPath, 'utf8');
                config = JSON.parse(configData);
                updateSetupStep(readConfigStep, 'completed');
                updateSetupStep(configFileStep, 'exists');
                logToFile('Existing config file found and read successfully');
            } catch (readError) {
                updateSetupStep(readConfigStep, 'failed', readError);
                throw new Error(`Failed to read config file: ${readError.message}`);
            }
        }

        // Prepare the new server config based on OS
        const configPrepStep = addSetupStep('prepare_server_config');

        // Determine if running through npx or locally
        const isNpx = import.meta.url.includes('node_modules');
        logToFile(`Running in ${isNpx ? 'npx' : 'local'} mode`);

        // Fix Windows path handling for npx execution
        let serverConfig;

        try {
            if (debugMode) {
                // Use Node.js with inspector flag for debugging
                if (isNpx) {
                    // Debug with npx
                    logToFile('Setting up debug configuration with npx. The process will pause on start until a debugger connects.');
                    // Add environment variables to help with debugging
                    const debugEnv = {
                        "NODE_OPTIONS": "--trace-warnings --trace-exit",
                        "DEBUG": "*"
                    };

                    serverConfig = {
                        "command": isWindows ? "node.exe" : "node",
                        "args": [
                            "--inspect-brk=9229",
                            isWindows ?
                                join(process.env.APPDATA || '', "npm", "npx.cmd").replace(/\\/g, '\\\\') :
                                "$(which npx)",
                            "@wonderwhy-er/desktop-commander@latest"
                        ],
                        "env": debugEnv
                    };
                } else {
                    // Debug with local installation path
                    const indexPath = join(__dirname, 'dist', 'index.js');
                    logToFile('Setting up debug configuration with local path. The process will pause on start until a debugger connects.');
                    // Add environment variables to help with debugging
                    const debugEnv = {
                        "NODE_OPTIONS": "--trace-warnings --trace-exit",
                        "DEBUG": "*"
                    };

                    serverConfig = {
                        "command": isWindows ? "node.exe" : "node",
                        "args": [
                            "--inspect-brk=9229",
                            indexPath//.replace(/\\/g, '\\\\') // Double escape backslashes for JSON
                        ],
                        "env": debugEnv
                    };
                }
            } else {
                // Standard configuration without debug
                if (isNpx) {
                    serverConfig = {
                        "command": isWindows ? "npx.cmd" : "npx",
                        "args": [
                            "@wonderwhy-er/desktop-commander@latest"
                        ]
                    };
                } else {
                    // For local installation, use absolute path to handle Windows properly
                    const indexPath = join(__dirname, 'dist', 'index.js');
                    serverConfig = {
                        "command": "node",
                        "args": [
                            indexPath//.replace(/\\/g, '\\\\') // Double escape backslashes for JSON
                        ]
                    };
                }
            }
            updateSetupStep(configPrepStep, 'completed');
        } catch (prepError) {
            updateSetupStep(configPrepStep, 'failed', prepError);
            throw new Error(`Failed to prepare server config: ${prepError.message}`);
        }

        // Update the config
        const updateConfigStep = addSetupStep('update_config');
        try {
            // Initialize mcpServers if it doesn't exist
            if (!config.mcpServers) {
                config.mcpServers = {};
            }

            // Check if the old "desktopCommander" exists and remove it
            if (config.mcpServers.desktopCommander) {
                delete config.mcpServers.desktopCommander;
                logToFile('Removed old desktopCommander configuration');
            }

            // Add or update the terminal server config with the proper name "desktop-commander"
            config.mcpServers["desktop-commander"] = serverConfig;

            // Write the updated config back
            writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2), 'utf8');
            updateSetupStep(updateConfigStep, 'completed');
            logToFile('Configuration updated successfully');
        } catch (updateError) {
            updateSetupStep(updateConfigStep, 'failed', updateError);
            throw new Error(`Failed to update config: ${updateError.message}`);
        }

        logToFile('Successfully added MCP server to Claude configuration!');
        logToFile(`Configuration location: ${claudeConfigPath}`);

        if (debugMode) {
            logToFile('\nTo use the debug server:\n1. Restart Claude if it\'s currently running\n2. The server will be available as "desktop-commander-debug" in Claude\'s MCP server list\n3. Connect your debugger to port 9229');
        } else {
            logToFile('\nTo use the server:\n1. Restart Claude if it\'s currently running\n2. The server will be available as "desktop-commander" in Claude\'s MCP server list');
        }

        // Try to restart Claude
        await restartClaude();

        // Mark the main setup as completed
        updateSetupStep(setupStep, 'completed');
        logToFile('Setup completed successfully');

        return true;
    } catch (error) {
        updateSetupStep(setupStep, 'failed', error);
        logToFile(`Error updating Claude configuration: ${error}`, true);
        return false;
    }
}

// Allow direct execution
if (process.argv.length >= 2 && process.argv[1] === fileURLToPath(import.meta.url)) {
    setup().then(success => {
        if (!success) {
            setTimeout(() => {
                process.exit(1);
            }, 1000);
        }
    }).catch(error => {
        logToFile(`Fatal error: ${error}`, true);
        setTimeout(() => {
            process.exit(1);
        }, 1000);
    });
}
