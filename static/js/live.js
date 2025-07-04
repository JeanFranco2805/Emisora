let stream;
let socket;
let micStream;
let micMuted = false;

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusText = document.getElementById('statusText');
let playlistQueue = [];
const queueList = document.getElementById('queueList');
const audioPlayer = document.getElementById('audioPlayer');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const volumeControl = document.getElementById('volumeControl');
const seekBar = document.getElementById('seekBar');
const songTitle = document.getElementById('songTitle');
const micSelect = document.getElementById('micSelect');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');
let typingTimeout;


function activarProteccion() {
    window.addEventListener('beforeunload', beforeUnloadHandler);
    window.addEventListener('keydown', interceptarRecarga);
}

function desactivarProteccion() {
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    window.removeEventListener('keydown', interceptarRecarga);
}

function interceptarRecarga(e) {
    const recarga =
        e.key === 'F5' || (e.key === 'r' && (e.ctrlKey || e.metaKey));
    if (!recarga) return;
    e.preventDefault();
    Swal.fire({
        title: '¿Recargar la página?',
        text: 'Si recargas se cortará la transmisión en vivo.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Recargar',
        cancelButtonText: 'Cancelar'
    }).then(res => {
        if (res.isConfirmed) {
            desactivarProteccion();
            location.reload();
        }
    });
}


function beforeUnloadHandler(e) {
    e.preventDefault();
    e.returnValue = '';
}

startBtn.addEventListener('click', async () => {
    try {
        window.addEventListener('beforeunload', beforeUnloadHandler);
        activarProteccion()
        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();
        const deviceId = micSelect.value;
        micStream = await navigator.mediaDevices.getUserMedia({
            audio: {deviceId: deviceId ? {exact: deviceId} : undefined}
        });
        //micStream = await navigator.mediaDevices.getUserMedia({audio: true});
        const micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(destination);

        const audioSource = audioContext.createMediaElementSource(audioPlayer);
        audioSource.connect(destination);
        audioSource.connect(audioContext.destination);
        micSource.connect(audioContext.destination);

        const mixedSource = audioContext.createMediaStreamSource(destination.stream);

        const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);

        mixedSource.connect(scriptNode);
        scriptNode.connect(audioContext.destination);

        const socket = io('https://emisora.onrender.com', {
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        scriptNode.onaudioprocess = (audioProcessingEvent) => {
            const inputBuffer = audioProcessingEvent.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);

            const pcmData = new Float32Array(inputData);
            socket.emit('broadcast-audio', pcmData.buffer);
        };

        statusText.textContent = "🔴 Transmitiendo en vivo";
        statusText.style.color = "#ff4d4d";

        startBtn.disabled = true;
        stopBtn.disabled = false;

        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = chatInput.value.trim();
            if (text !== "") {
                const msg = {
                    text: text,
                    sender: "Locutor",
                    id: Date.now(),
                    reactions: {}
                };
                socket.emit('chat-message', msg);
                addMessageToChatFull(msg, true);
                chatInput.value = "";
            }
        });

        socket.on('chat-message', (msg) => {
            addMessageToChatFull(msg, msg.sender === "Locutor");
        });

        socket.on('delete-message', (msgId) => {
            deleteMessageFromChat(msgId);
        });

        socket.on('reaction', ({messageId, emoji, count}) => {
            updateMessageReaction(messageId, emoji, count);
        });

        chatInput.addEventListener('input', () => {
            socket.emit('typing', {sender: "Locutor"});
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                socket.emit('stop-typing', {sender: "Locutor"});
            }, 3000);
        });

        socket.on('typing', data => {
            document.getElementById('typingStatus').textContent = `${data.sender} está escribiendo...`;
        });

        socket.on('stop-typing', data => {
            document.getElementById('typingStatus').textContent = "";
        });
        document.getElementById('muteMicBtn').disabled = false;

    } catch (error) {
        statusText.textContent = "❌ Error al acceder al micrófono o audio";
        console.error(error);
    }
});

stopBtn.addEventListener('click', () => {
    if (socket) socket.disconnect();
    if (stream) stream.getTracks().forEach(track => track.stop());
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    statusText.textContent = "🟢 Listo para transmitir";
    statusText.style.color = "#00ff94";
    document.getElementById('muteMicBtn').disabled = true;
    document.getElementById('muteMicBtn').textContent = "🎤 Silenciar Mic";
    micMuted = false;
    micStream = null;
    startBtn.disabled = false;
    stopBtn.disabled = true;
});

audioPlayer.addEventListener('ended', async () => {
    console.log("Canción terminada.");
    if (currentSong) {
        const horaBogota = Number(
            new Date().toLocaleString("en-US", {
                timeZone: "America/Bogota",
                hour: "2-digit",
                hour12: false
            })
        );
        await eliminarCancionBD(currentSong.fullText, horaBogota);
        currentSong = null;
    }
    playNextSongInQueue();
});


playBtn.addEventListener('click', () => {
    audioPlayer.play().catch(err => {
        console.error("Error al reproducir audioPlayer:", err);
    });
});

pauseBtn.addEventListener('click', () => {
    audioPlayer.pause();
});

volumeControl.addEventListener('input', () => {
    audioPlayer.volume = volumeControl.value;
});

audioPlayer.addEventListener('timeupdate', () => {
    if (!isNaN(audioPlayer.duration)) {
        const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        seekBar.value = percent;
    }
});

seekBar.addEventListener('input', () => {
    if (!isNaN(audioPlayer.duration)) {
        audioPlayer.currentTime = (seekBar.value / 100) * audioPlayer.duration;
    }
});

const categorySelect = document.getElementById('categorySelect');
const songList = document.getElementById('songList');

async function loadCategories() {
    try {
        const res = await fetch("/api/folders");
        const data = await res.json();

        if (!res.ok || !data.folders) throw new Error("No se pudieron cargar categorías");

        categorySelect.innerHTML = '<option disabled selected>Selecciona una categoría</option>';

        data.folders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder;
            option.textContent = folder.charAt(0).toUpperCase() + folder.slice(1);
            categorySelect.appendChild(option);
        });

    } catch (err) {
        console.error("Error cargando categorías:", err);
        songList.innerHTML = "<p style='color: #f66;'>Error al cargar categorías.</p>";
    }
}

categorySelect.addEventListener('change', async () => {
    const category = categorySelect.value;
    songList.innerHTML = "⏳ Cargando canciones...";

    try {
        const res = await fetch(`/api/category-songs/${category}`);
        const data = await res.json();

        if (!data.songs || data.songs.length === 0) {
            songList.innerHTML = "<p style='color: #aaa;'>No hay canciones en esta categoría.</p>";
            return;
        }

        songList.innerHTML = "";
        data.songs.forEach(song => {
            const btn = document.createElement('button');
            btn.textContent = `🎵 ${song.title}`;
            btn.addEventListener('click', () => {
                playlistQueue.push({
                    url: `/api/proxy-cloudinary/${encodeURIComponent(song.public_id)}`,
                    title: song.title
                });

                const li = document.createElement('li');
                li.textContent = `🎵 ${song.title}`;
                queueList.appendChild(li);

                if (audioPlayer.paused && playlistQueue.length === 1) {
                    playNextSongInQueue();
                } else {
                    console.log(`Añadida a la cola: ${song.title}`);
                }
            });

            songList.appendChild(btn);
        });

    } catch (err) {
        console.error("Error cargando canciones:", err);
        songList.innerHTML = "<p style='color: #f66;'>Error al cargar canciones.</p>";
    }
});

async function playNextSongInQueue() {
    if (playlistQueue.length > 0) {
        const nextSong = playlistQueue.shift();
        currentSong = nextSong;

        if (queueList.firstChild) queueList.removeChild(queueList.firstChild);

        audioPlayer.src = nextSong.url;
        await audioPlayer.play().catch(err => console.error("Error:", err));
        songTitle.textContent = `🎵 ${nextSong.title}`;
        return;
    }

    console.log("Cola vacía. Buscando programación siguiente…");

    try {
        const progRes = await fetch("/api/cargar-programacion");
        const programacion = await progRes.json();

        const ahora = new Date().toLocaleString("en-US", {
            timeZone: "America/Bogota",
            hour: "2-digit",
            hour12: false
        });
        let hora = Number(ahora);

        for (let i = 1; i <= 24; i++) {
            hora = (hora + 1) % 24;
            const lista = programacion[hora] || [];
            if (lista.length === 0) continue;

            console.log(`🎯 Encontradas ${lista.length} canciones en la hora ${hora}:00`);

            const temasRes = await fetch("/api/todos-los-temas");
            const catalogo = await temasRes.json();

            lista.forEach(texto => {
                const [title] = texto.split(" - ");
                const dato = catalogo.find(t => t.title.trim() === title.trim());
                if (!dato) return;

                playlistQueue.push({
                    url: `/api/proxy-cloudinary/${encodeURIComponent(dato.public_id)}`,
                    title: dato.title,
                    fullText: texto
                });

                const li = document.createElement("li");
                li.textContent = `🎵 ${dato.title}`;
                queueList.appendChild(li);
            });

            if (playlistQueue.length > 0) {
                await playNextSongInQueue();
            }
            return;
        }

        console.warn("🔚 No se encontró programación en las próximas 24 h.");
        songTitle.textContent = "⏹️ No hay más programación";

    } catch (err) {
        console.error("❌ Error al buscar programación siguiente:", err);
    }
}


document.getElementById('clearQueueBtn').addEventListener('click', () => {
    playlistQueue = [];
    queueList.innerHTML = "";
    console.log("Cola limpiada.");
});

async function cargarProgramacionYReproducir() {
    try {
        const horaBogota = Number(
            new Date().toLocaleString("en-US", {
                timeZone: "America/Bogota",
                hour: "2-digit",
                hour12: false
            })
        );

        const res = await fetch("/api/cargar-programacion");
        const data = await res.json();

        const cancionesHora = data[horaBogota] ?? [];
        if (!cancionesHora.length) {
            console.log(`🎧 No hay canciones programadas para la hora ${horaBogota}:00`);
            return;
        }

        const temasRes = await fetch("/api/todos-los-temas");
        const cancionesDB = await temasRes.json();

        const cancionesValidas = cancionesHora
            .map(texto => {
                const [title] = texto.split(" - ");
                const song = cancionesDB.find(c => c.title.trim() === title.trim());
                return song
                    ? {
                        url: `/api/proxy-cloudinary/${encodeURIComponent(song.public_id)}`,
                        title: song.title,
                        fullText: texto  // Aquí guardamos el texto completo "Título - Artista"
                    }
                    : null;
            })
            .filter(Boolean);

        playlistQueue = [];
        queueList.innerHTML = "";
        cancionesValidas.forEach(song => {
            playlistQueue.push(song);
            const li = document.createElement("li");
            li.textContent = `🎵 ${song.title}`;
            queueList.appendChild(li);
        });

        if (audioPlayer.paused && playlistQueue.length) {
            playNextSongInQueue();
        }
    } catch (err) {
        console.error("❌ Error al cargar programación de la hora actual:", err);
    }
}


cargarProgramacionYReproducir();

async function cargarProgramacionEnCola() {
    try {
        const horaBogota = Number(
            new Date().toLocaleString("en-US", {
                timeZone: "America/Bogota",
                hour: "2-digit",
                hour12: false
            })
        );
        const res = await fetch('/api/cargar-programacion');
        const data = await res.json();
        const canciones = data[horaBogota] || [];

        if (canciones.length === 0) {
            console.log(`⏰ No hay canciones programadas para la hora ${horaBogota}:00`);
            return;
        }

        const cloudRes = await fetch('/api/cloudinary-files');
        const cloudFiles = await cloudRes.json();

        let cancionesAgregadas = new Set();

        for (const cancionTexto of canciones) {
            if (cancionesAgregadas.has(cancionTexto)) continue;
            cancionesAgregadas.add(cancionTexto);

            const [titulo] = cancionTexto.split(" - ");
            if (!titulo) continue;

            const match = cloudFiles.find(c =>
                c.public_id.includes(titulo.trim())
            );

            if (!match) {
                console.warn(`❌ No se encontró la canción: ${titulo}`);
                continue;
            }

            playlistQueue.push({
                url: `/api/proxy-cloudinary/${encodeURIComponent(match.public_id)}`,
                title: cancionTexto
            });

            const li = document.createElement('li');
            li.textContent = `🎵 ${cancionTexto}`;
            queueList.appendChild(li);
        }

        console.log(`✅ Se cargaron ${playlistQueue.length} canciones para la hora ${horaBogota}:00`);
    } catch (err) {
        console.error("❌ Error al cargar la programación de la hora actual:", err);
    }
}

playBtn.addEventListener('click', async () => {
    if (playlistQueue.length === 0) {
        await cargarProgramacionEnCola();
    }
    audioPlayer.play().catch(err => {
        console.error("Error al reproducir audioPlayer:", err);
    });
});

async function initMicList() {
    await navigator.mediaDevices.getUserMedia({audio: true});
    await refreshMicList();
    navigator.mediaDevices.addEventListener('devicechange', refreshMicList);
}

async function refreshMicList() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === 'audioinput');
    micSelect.innerHTML = '';
    mics.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Micrófono ${micSelect.length + 1}`;
        micSelect.appendChild(opt);
    });
}

micSelect.addEventListener('change', async () => {
    if (!micStream) return;
    micStream.getTracks().forEach(t => t.stop());

    const deviceId = micSelect.value;
    micStream = await navigator.mediaDevices.getUserMedia({
        audio: {deviceId: {exact: deviceId}}
    });

    const newSource = audioContext.createMediaStreamSource(micStream);
    newSource.connect(destination);
    newSource.connect(audioContext.destination);
});

document.getElementById('muteMicBtn').addEventListener('click', () => {
    if (!micStream) return;
    micMuted = !micMuted;
    micStream.getAudioTracks().forEach(track => track.enabled = !micMuted);

    const btn = document.getElementById('muteMicBtn');
    btn.textContent = micMuted ? "🔇 Micrófono Muted" : "🎤 Silenciar Mic";
    btn.style.background = micMuted ? "#faa" : "";
});
async function eliminarCancionBD(textoCompleto, horaBogota) {
    try {
        await fetch("/api/programacion/cancion", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hora: horaBogota, cancion: textoCompleto })
        });
        console.log(`🗑️ Eliminada de la hora ${horaBogota}: ${textoCompleto}`);
    } catch (err) {
        console.error("❌ No se pudo borrar en la BD:", err);
    }
}

loadCategories();
initMicList()