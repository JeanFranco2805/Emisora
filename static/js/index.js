document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.getElementById("toggleSidebar");
    const sidebar = document.getElementById("sidebar");

    toggleBtn?.addEventListener("click", () => {
        sidebar.classList.toggle("active");
    });

    const modal = document.getElementById("playlistModal");
    const playlistTitle = document.getElementById("playlistTitle");
    const playlistSongs = document.getElementById("playlistSongs");
    const closeModal = document.querySelector(".close-button");
    const audioPlayer = document.getElementById("audioPlayer");
    const playlists = {};
    const categoryContainer = document.getElementById("categoryCardsContainer");

    fetch("/api/folders")
        .then(res => res.json())
        .then(data => {
            const folders = data.folders || [];

            folders.forEach(folder => {
                fetch(`/api/category-songs/${folder}`)
                    .then(res => res.json())
                    .then(categoryData => {
                        const songs = categoryData.songs || [];
                        if (songs.length > 0) {
                            playlists[folder.toLowerCase()] = songs;

                            const card = document.createElement("div");
                            card.className = "playlist-card";
                            card.setAttribute("data-genero", folder.toLowerCase());

                            const imageSrc = `/static/images/${folder.toLowerCase()}.jpg`;

                            card.innerHTML = `
                                <img src="${imageSrc}" alt="${folder}" />
                                <h2>${folder}</h2>
                            `;

                            card.addEventListener("click", () => {
                                showPlaylistModal(folder, songs);
                            });

                            categoryContainer.appendChild(card);
                        }
                    });
            });
        });

    function showPlaylistModal(folder, canciones) {
        playlistTitle.textContent = `🎶 Playlist de ${folder}`;
        playlistSongs.innerHTML = '';

        canciones.forEach(c => {
            const li = document.createElement('li');
            li.className = 'song-item';
            li.innerHTML = `
                <div class="song-info">
                    <strong>${c.title}</strong> – <em>${c.artist || 'Desconocido'}</em>
                </div>
                <div class="controls">
                    <button class="play-btn">▶️ Reproducir</button>
                    <button class="pause-btn" style="display: none;">⏸️ Pausar</button>
                    <button class="restart-btn" style="display: none;">🔄 Reiniciar</button>
                </div>
            `;

            const playBtn = li.querySelector('.play-btn');
            const pauseBtn = li.querySelector('.pause-btn');
            const restartBtn = li.querySelector('.restart-btn');

            playBtn.addEventListener('click', () => {
                if (audioPlayer.dataset.currentId !== c.public_id) {
                    reproducirDesdeCloudinary(c.public_id);
                    audioPlayer.dataset.currentId = c.public_id;
                } else {
                    audioPlayer.play();
                }
                playBtn.style.display = "none";
                pauseBtn.style.display = "inline-block";
                restartBtn.style.display = "inline-block";
            });

            pauseBtn.addEventListener('click', () => {
                audioPlayer.pause();
                playBtn.style.display = "inline-block";
                pauseBtn.style.display = "none";
            });

            restartBtn.addEventListener('click', () => {
                audioPlayer.currentTime = 0;
                audioPlayer.play();
            });

            playlistSongs.appendChild(li);
        });

        modal.classList.add("active");
    }

    function reproducirDesdeCloudinary(publicId) {
        console.log(publicId)
        fetch(`/api/cloudinary-files/${publicId}`)
            .then(res => res.json())
            .then(data => {
                if (data.url) {
                    audioPlayer.src = data.url;
                    audioPlayer.play();
                    audioPlayer.style.display = "block";
                } else {
                    alert("No se encontró la canción.");
                }
            })
            .catch(err => {
                console.error(err);
                alert("Error al cargar la canción.");
            });
    }

    closeModal.addEventListener('click', () => {
        modal.classList.remove("active");
    });

    window.addEventListener("click", e => {
        if (e.target === modal) {
            modal.classList.remove("active");
        }
    });
});
