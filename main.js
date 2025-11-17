import { initTwitch } from './twitch.js';
import { Game } from './game.js';
import { AudioManager } from './audio-manager.js';
import * as Persistence from './game/persistence.js';

const connectContainer = document.getElementById('connect-container');
const worldSelectContainer = document.getElementById('world-select-container');
const worldList = document.getElementById('world-list');
const worldSettingsContainer = document.getElementById('world-settings-container');
const gameContainer = document.getElementById('game-container');
const channelInput = document.getElementById('channel-input');
const connectBtn = document.getElementById('connect-btn');
const canvas = document.getElementById('game-canvas');
const createWorldBtn = document.getElementById('create-world-btn');
const importWorldBtn = document.getElementById('import-world-btn');


const STORAGE_KEY = 'twitch_channel_name';
const PLAYERS_STORAGE_PREFIX = 'twitch_game_players_';
const MAP_STORAGE_PREFIX = 'twitch_game_map_';

function showGame(channel, worldName, hosts) {
    worldSelectContainer.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    startGame(channel, worldName, hosts);
}

function showDeleteConfirmation(onConfirm) {
    const overlay = document.createElement('div');
    overlay.id = 'delete-confirm-overlay';

    const popup = document.createElement('div');
    popup.id = 'delete-confirm-popup';

    popup.innerHTML = `
        <button id="delete-confirm-close-btn">&times;</button>
        <h2>Are you sure?</h2>
        <p>This will permanently delete the world and all its data. This action cannot be undone.</p>
        <div class="delete-confirm-actions">
            <button id="delete-confirm-yes-btn">Yes (Cannot be undone)</button>
            <button id="delete-confirm-cancel-btn">Cancel</button>
        </div>
    `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    const closePopup = () => {
        if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
        }
        document.removeEventListener('keydown', handleEsc);
    };

    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            closePopup();
        }
    };

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closePopup();
        }
    });

    document.getElementById('delete-confirm-close-btn').addEventListener('click', closePopup);
    document.getElementById('delete-confirm-cancel-btn').addEventListener('click', closePopup);
    document.getElementById('delete-confirm-yes-btn').addEventListener('click', () => {
        onConfirm();
        closePopup();
    });

    document.addEventListener('keydown', handleEsc, { once: true });
}

function showWorldSelect(channel) {
    connectContainer.classList.add('hidden');
    worldSelectContainer.classList.remove('hidden');
    document.getElementById('world-select-title').textContent = `Worlds for #${channel}`;
    populateWorldList(channel);
}

function showWorldSettings(channel, worldName) {
    let currentWorldName = worldName;
    worldSettingsContainer.classList.remove('hidden');
    worldSettingsContainer.innerHTML = `
        <div class="settings-section">
            <label for="world-name-input">World Name</label>
            <input type="text" id="world-name-input" class="world-name-input" value="${currentWorldName}">
        </div>
        <div class="settings-section admin-management">
            <label for="admin-input">Manage Admins</label>
            <p style="font-size: 14px; color: #aaa; margin: 0;">Admins can use special commands in-game.</p>
            <div class="admin-input-group">
                <input type="text" id="admin-input" placeholder="Enter username...">
                <button id="add-admin-btn">Add Admin</button>
            </div>
            <ul id="admin-list"></ul>
        </div>
        <button id="play-btn">Play</button>

        <div class="settings-section delete-section">
            <label for="delete-world-input">Delete World</label>
            <p style="font-size: 14px; color: #aaa; margin: 0;">This action cannot be undone. To confirm, type the world name below.</p>
            <div class="delete-input-group">
                <input type="text" id="delete-world-input" placeholder="Type world name to confirm...">
                <button id="delete-world-btn" disabled>Delete</button>
            </div>
        </div>
    `;

    const worldNameInputEl = document.getElementById('world-name-input');
    
    function handleRename() {
        const newWorldName = worldNameInputEl.value.trim();
        if (newWorldName && newWorldName !== currentWorldName) {
            const existingWorlds = findWorldsForChannel(channel);
            if (existingWorlds.includes(newWorldName)) {
                alert(`A world named "${newWorldName}" already exists. Please choose a different name.`);
                worldNameInputEl.value = currentWorldName; // Revert
                return false;
            }

            const oldKeys = Persistence.getStorageKeys(channel, currentWorldName);
            const newKeys = Persistence.getStorageKeys(channel, newWorldName);

            const playerData = localStorage.getItem(oldKeys.playersStorageKey);
            if (playerData) {
                localStorage.setItem(newKeys.playersStorageKey, playerData);
                localStorage.removeItem(oldKeys.playersStorageKey);
            }

            const mapData = localStorage.getItem(oldKeys.mapStorageKey);
            if (mapData) {
                localStorage.setItem(newKeys.mapStorageKey, mapData);
                localStorage.removeItem(oldKeys.mapStorageKey);
            }
            
            const hostsData = localStorage.getItem(oldKeys.hostsStorageKey);
            if (hostsData) {
                localStorage.setItem(newKeys.hostsStorageKey, hostsData);
                localStorage.removeItem(oldKeys.hostsStorageKey);
            }
            
            console.log(`World "${currentWorldName}" renamed to "${newWorldName}".`);
            currentWorldName = newWorldName; // Update internal state
            populateWorldList(channel); // Refresh list
            
            // Re-select the newly named world
            setTimeout(() => {
                const worldItems = document.querySelectorAll('.world-item');
                const newWorldEl = Array.from(worldItems).find(el => {
                    const h3 = el.querySelector('h3');
                    return h3 && h3.textContent === newWorldName;
                });
                if (newWorldEl) {
                    newWorldEl.classList.add('selected');
                }
            }, 0);
            return true;
        }
        return false;
    }

    worldNameInputEl.addEventListener('blur', () => {
        if (handleRename()) {
            // After a successful rename, we need to "re-render" the settings
            // to ensure all event handlers and variables are using the new world name.
            showWorldSettings(channel, currentWorldName);
            // Re-select the item in the list after re-render
            setTimeout(() => {
                const worldItems = document.querySelectorAll('.world-item');
                const newWorldEl = Array.from(worldItems).find(el => {
                    const h3 = el.querySelector('h3');
                    return h3 && h3.textContent === currentWorldName;
                });
                if (newWorldEl) {
                    newWorldEl.classList.add('selected');
                }
            }, 0);
        }
    });

    const { hostsStorageKey } = Persistence.getStorageKeys(channel, currentWorldName);
    let hosts = Persistence.loadHosts(hostsStorageKey);

    const adminListEl = document.getElementById('admin-list');
    const adminInputEl = document.getElementById('admin-input');
    const addAdminBtn = document.getElementById('add-admin-btn');
    const playBtn = document.getElementById('play-btn');

    function renderAdmins() {
        adminListEl.innerHTML = '';
        hosts.forEach(host => {
            const li = document.createElement('li');
            li.className = 'admin-item';
            li.textContent = host;
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-admin-btn';
            removeBtn.innerHTML = '&times;';
            removeBtn.onclick = () => {
                hosts = hosts.filter(h => h !== host);
                Persistence.saveHosts(hosts, Persistence.getStorageKeys(channel, currentWorldName).hostsStorageKey);
                renderAdmins();
            };
            li.appendChild(removeBtn);
            adminListEl.appendChild(li);
        });
    }
    
    addAdminBtn.addEventListener('click', () => {
        const newAdmin = adminInputEl.value.trim().toLowerCase();
        if (newAdmin && !hosts.includes(newAdmin)) {
            hosts.push(newAdmin);
            Persistence.saveHosts(hosts, Persistence.getStorageKeys(channel, currentWorldName).hostsStorageKey);
            renderAdmins();
            adminInputEl.value = '';
        }
    });

    adminInputEl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addAdminBtn.click();
        }
    });

    playBtn.addEventListener('click', () => {
        const renamed = handleRename(); // Save name change on play, if any
        showGame(channel, currentWorldName, hosts);
    });

    // --- Delete World Logic ---
    const deleteWorldInput = document.getElementById('delete-world-input');
    const deleteWorldBtn = document.getElementById('delete-world-btn');

    deleteWorldInput.addEventListener('input', () => {
        if (deleteWorldInput.value === currentWorldName) {
            deleteWorldBtn.disabled = false;
        } else {
            deleteWorldBtn.disabled = true;
        }
    });

    deleteWorldBtn.addEventListener('click', () => {
        if (deleteWorldBtn.disabled) return;

        showDeleteConfirmation(() => {
            console.log(`Deleting world: ${currentWorldName}`);
            const keys = Persistence.getStorageKeys(channel, currentWorldName);
            localStorage.removeItem(keys.playersStorageKey);
            localStorage.removeItem(keys.mapStorageKey);
            localStorage.removeItem(keys.hostsStorageKey);
            
            worldSettingsContainer.classList.add('hidden');
            populateWorldList(channel);
            alert(`World "${currentWorldName}" has been deleted.`);
        });
    });

    renderAdmins();
}

function populateWorldList(channel) {
    worldList.innerHTML = '';
    const worlds = findWorldsForChannel(channel);

    if (worlds.length === 0) {
        // Handle case for a new channel with no worlds. We can treat the 'default' world as the first one.
        worlds.push('default'); 
    }

    worlds.forEach(worldName => {
        const worldEl = document.createElement('div');
        worldEl.className = 'world-item';
        
        const playerDataKey = worldName === 'default' 
            ? `${PLAYERS_STORAGE_PREFIX}${channel}`
            : `${PLAYERS_STORAGE_PREFIX}${channel}_${worldName}`;
            
        const playersData = localStorage.getItem(playerDataKey);
        const playerCount = playersData ? Object.keys(JSON.parse(playersData)).length : 0;

        worldEl.innerHTML = `
            <h3>${worldName}</h3>
            <p>${playerCount} players</p>
            <button class="export-btn">Export Data</button>
        `;

        worldEl.addEventListener('click', (e) => {
            if (e.target.classList.contains('export-btn')) return;
            // Deselect others, select this one
            document.querySelectorAll('.world-item.selected').forEach(el => el.classList.remove('selected'));
            worldEl.classList.add('selected');
            showWorldSettings(channel, worldName);
        });
        
        const exportBtn = worldEl.querySelector('.export-btn');
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportWorldData(channel, worldName);
        });

        worldList.appendChild(worldEl);
    });
}

function findWorldsForChannel(channel) {
    const worlds = new Set();
    const prefix = `${PLAYERS_STORAGE_PREFIX}${channel}_`;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(prefix)) {
            const worldName = key.substring(prefix.length);
            worlds.add(worldName);
        }
    }
     // Support legacy single-world format
    if (localStorage.getItem(`${PLAYERS_STORAGE_PREFIX}${channel}`)) {
        worlds.add('default');
    }

    return Array.from(worlds);
}

function exportWorldData(channel, worldName) {
    const playerDataKey = worldName === 'default' 
        ? `${PLAYERS_STORAGE_PREFIX}${channel}` 
        : `${PLAYERS_STORAGE_PREFIX}${channel}_${worldName}`;

    const mapDataKey = worldName === 'default' 
        ? `${MAP_STORAGE_PREFIX}${channel}` 
        : `${MAP_STORAGE_PREFIX}${channel}_${worldName}`;

    const players = JSON.parse(localStorage.getItem(playerDataKey) || '{}');
    const map = JSON.parse(localStorage.getItem(mapDataKey) || '{}');

    const worldData = {
        channel,
        worldName,
        timestamp: new Date().toISOString(),
        data: {
            players,
            map
        }
    };

    const dataStr = JSON.stringify(worldData, null, 2);
    const dataBlob = new Blob([dataStr], {type: "application/json"});
    const url = URL.createObjectURL(dataBlob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${channel}_${worldName}_backup.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function handleWorldImport() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const worldData = JSON.parse(e.target.result);
                processImportedWorld(worldData);
            } catch (error) {
                alert('Error: Could not parse the JSON file. Please ensure it is a valid world export file.');
                console.error('JSON parsing error:', error);
            }
        };
        reader.readAsText(file);
    });

    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

function findAvailableWorldName(baseName, existingWorlds) {
    if (!existingWorlds.includes(baseName)) {
        return baseName;
    }
    let i = 1;
    while (true) {
        const newName = `${baseName} (${i})`;
        if (!existingWorlds.includes(newName)) {
            return newName;
        }
        i++;
    }
}

function saveImportedWorld(channel, worldName, data) {
    const playerDataKey = `${PLAYERS_STORAGE_PREFIX}${channel}_${worldName}`;
    const mapDataKey = `${MAP_STORAGE_PREFIX}${channel}_${worldName}`;

    try {
        localStorage.setItem(playerDataKey, JSON.stringify(data.players || {}));
        localStorage.setItem(mapDataKey, JSON.stringify(data.map || {}));
        console.log(`Successfully imported and saved world "${worldName}" for channel "${channel}".`);
        alert(`Successfully imported world: ${worldName}`);
    } catch (e) {
        alert('An error occurred while saving the imported world data. The browser storage might be full.');
        console.error('Error saving imported world:', e);
    }
}

function processImportedWorld(worldData) {
    if (!worldData.worldName || !worldData.data || !worldData.data.players || !worldData.data.map) {
        alert('Invalid world file format.');
        return;
    }

    const channel = localStorage.getItem(STORAGE_KEY);
    let importedWorldName = worldData.worldName;

    if (importedWorldName.toLowerCase() === 'default') {
        const newName = prompt("Importing a world named 'default' is not allowed as it cannot be overwritten. Please provide a new name for this world.", "default_imported");
        if (newName && newName.trim() !== '') {
            importedWorldName = newName.trim();
        } else {
            alert('Import cancelled: A valid name is required.');
            return; // User cancelled or entered empty name
        }
    }
    
    const existingWorlds = findWorldsForChannel(channel);
    
    if (existingWorlds.includes(importedWorldName)) {
        const choice = prompt(`A world named "${importedWorldName}" already exists.\n\nType 'overwrite' to replace it.\nType 'copy' to save it as a new world.\n\nAnything else will cancel.`, 'copy');

        if (choice && choice.toLowerCase() === 'overwrite') {
            // Name remains the same, will overwrite existing data.
        } else if (choice && choice.toLowerCase() === 'copy') {
            importedWorldName = findAvailableWorldName(importedWorldName, existingWorlds);
            alert(`The world will be imported as "${importedWorldName}".`);
        } else {
            alert('Import cancelled.');
            return; // User cancelled or entered invalid input
        }
    }

    saveImportedWorld(channel, importedWorldName, worldData.data);
    populateWorldList(channel);
}

function startGame(channel, worldName, hosts) {
    console.log(`Connecting to #${channel}, world: ${worldName}...`);
    // showGame(); // showGame is now the entry point

    AudioManager.init();

    const game = new Game(canvas, channel, worldName, hosts);
    
    initTwitch(
        channel, 
        (chatter) => { // onChatter for energy
            game.addOrUpdatePlayer(chatter);
        },
        (userId, command, args) => { // onCommand
            game.handlePlayerCommand(userId, command, args);
        }
    );

    game.start();
}

connectBtn.addEventListener('click', () => {
    const channel = channelInput.value.trim().toLowerCase();
    if (channel) {
        localStorage.setItem(STORAGE_KEY, channel);
        showWorldSelect(channel);
    }
});

importWorldBtn.addEventListener('click', () => {
    handleWorldImport();
});

channelInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        connectBtn.click();
    }
});

// Load channel from localStorage on startup
const savedChannel = localStorage.getItem(STORAGE_KEY);
if (savedChannel) {
    channelInput.value = savedChannel;
}