import os
from datetime import datetime
from zoneinfo import ZoneInfo

import requests
from flask import Blueprint, session
import cloudinary
import cloudinary.uploader
import cloudinary.api
from flask import request, jsonify
from db import db
from backend.song import Song, Programacion, Usuario

api = Blueprint("api", __name__)

cloudinary.config(
    cloud_name="dbd1c0w5y",
    api_key="696814672513982",
    api_secret="v3skscgYLUbRDIfGJompcTx570k",
    secure=True
)

songs = []


@api.route('/signup', methods=['POST'])
def signup():
    nombre = request.form['nombre']
    email = request.form['email']
    password = request.form['password']
    if Usuario.query.filter_by(email=email).first():
        return jsonify({'mensaje': 'El correo ya existe'}), 400
    usuario = Usuario(nombre=nombre, email=email)
    usuario.set_password(password)
    db.session.add(usuario)
    db.session.commit()
    return jsonify({'mensaje': 'Usuario registrado exitosamente'})


@api.route('/login', methods=['POST'])
def login():
    email = request.form['email']
    password = request.form['password']
    usuario = Usuario.query.filter_by(email=email).first()

    if usuario and usuario.check_password(password):
        session['usuario_id'] = usuario.id
        session['rol'] = usuario.rol

        if usuario.rol.strip().lower() == 'admin':
            return jsonify({'mensaje': 'Login exitoso', 'redirect': '/admin/'})
        else:
            return jsonify({'mensaje': 'Login exitoso', 'redirect': '/'})

    return jsonify({'mensaje': 'Credenciales incorrectas'}), 401


@api.route("/programacion/cancion", methods=["DELETE"])
def eliminar_cancion_programada():
    data = request.get_json()
    hora = int(data.get("hora"))
    cancion_a_eliminar = data.get("cancion")

    if hora is None or not cancion_a_eliminar:
        return jsonify({"error": "Datos incompletos"}), 400

    programacion = Programacion.query.filter_by(hora=hora).first()
    if not programacion:
        return jsonify({"error": "No hay programación para esa hora"}), 404
    try:
        canciones = json.loads(programacion.canciones)
        if cancion_a_eliminar in canciones:
            canciones.remove(cancion_a_eliminar)
            programacion.canciones = json.dumps(canciones)
            db.session.commit()
            return jsonify({"ok": True, "eliminada": cancion_a_eliminar}), 200
        else:
            return jsonify({"error": "Canción no encontrada en la lista"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api.route('/programacion-actual')
def programacion_actual():
    hora_bogota = datetime.now(ZoneInfo("America/Bogota")).hour  # 0‑23

    bloque = Programacion.query.filter_by(hora=hora_bogota).first()
    if not bloque:
        return jsonify({"hora": hora_bogota, "songs": []})

    canciones = json.loads(bloque.canciones)
    return jsonify({"hora": hora_bogota, "songs": canciones})


@api.route('/logout')
def logout():
    session.pop('usuario_id', None)
    return jsonify({'mensaje': 'Sesión cerrada'})


@api.route('/profile')
def profile():
    usuario_id = session.get('usuario_id')
    if not usuario_id:
        return jsonify({'mensaje': 'No autenticado'}), 401
    usuario = Usuario.query.get(usuario_id)
    return jsonify({
        'nombre': usuario.nombre,
        'email': usuario.email,
        'rol': usuario.rol
    })


@api.route("/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    raw_public_id = request.form.get("public_id", "")
    genre = request.form.get("genre")
    if not genre:
        return jsonify({"error": "Genre (categoria) es requerida"}), 400

    try:
        folder_path = f"music/{genre.strip()}/"

        safe_public_id = raw_public_id.strip().split("/")[-1] if raw_public_id else None

        upload_result = cloudinary.uploader.upload(
            file,
            resource_type="video",
            folder=folder_path,
            public_id=safe_public_id
        )
        return jsonify({
            "message": "Upload successful",
            "url": upload_result["secure_url"],
            "public_id": upload_result["public_id"]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api.route("/cloudinary-files", methods=["GET"])
def get_cloudinary_files():
    try:
        result = cloudinary.api.resources(
            type="upload",
            resource_type="video",
            max_results=50,
        )
        files = [
            {
                "public_id": res["public_id"],
                "url": res["secure_url"],
                "type": res["resource_type"]
            }
            for res in result["resources"]
        ]
        return jsonify(files)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api.route("/cloudinary-files/<path:public_id>", methods=["GET"])
def get_file_by_public_id(public_id):
    try:
        resource = cloudinary.api.resource(public_id, resource_type="video")
        return jsonify({
            "public_id": resource["public_id"],
            "url": resource["secure_url"],
            "type": resource["resource_type"]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 404


@api.route('/add-song', methods=['POST'])
def add_song():
    data = request.get_json()
    try:
        song = Song(
            title=data['title'],
            artist=data['artist'],
            genre=data['genre'],
            public_id=data['id']
        )
        db.session.add(song)
        db.session.commit()

        return jsonify({
            "message": "Canción guardada",
            "song": {
                "title": song.title,
                "artist": song.artist,
                "genre": song.genre,
                "public_id": song.public_id
            }
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


programacion_horas = {}

import json


@api.route("/guardar-programacion", methods=["POST"])
def guardar_programacion():
    data = request.get_json()
    hora = data.get("hora")
    canciones = data.get("canciones")

    if hora is None or canciones is None:
        return jsonify({"error": "Datos incompletos"}), 400

    if not isinstance(canciones, list) or any(
            not isinstance(c, dict) or 'texto' not in c or 'duracion' not in c for c in canciones
    ):
        return jsonify({"error": "Formato de canciones inválido"}), 400

    canciones_json = json.dumps(canciones)
    prog = Programacion.query.filter_by(hora=hora).first()
    if prog:
        prog.canciones = canciones_json
    else:
        prog = Programacion(hora=hora, canciones=canciones_json)
        db.session.add(prog)

    db.session.commit()
    return jsonify({"ok": True, "message": "Programación guardada correctamente"})


@api.route("/all-videos", methods=["GET"])
def list_all_videos():
    try:
        result = cloudinary.api.resources(
            type="upload",
            resource_type="video",
            max_results=100
        )
        for res in result["resources"]:
            print("Public ID:", res["public_id"])
        return jsonify(result["resources"])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api.route("/cargar-programacion", methods=["GET"])
def cargar_programacion():
    programaciones = Programacion.query.all()
    resultado = {
        prog.hora: json.loads(prog.canciones)
        for prog in programaciones
    }
    return jsonify(resultado)


@api.route("/category-songs/<category_name>", methods=["GET"])
def get_songs_by_category(category_name):
    try:
        folder = category_name.strip()
        prefix_path = f"music/{folder}/"
        result = cloudinary.api.resources(
            type="upload",
            resource_type="video",
            prefix=prefix_path,
            max_results=50
        )

        songs_data = []
        for res in result.get("resources", []):
            public_id = res["public_id"]
            song_db = Song.query.filter_by(public_id=public_id).first()
            artist_name = song_db.artist if song_db else "Desconocido"
            title = song_db.title if song_db else os.path.basename(public_id)
            duration = res.get("bytes") or (song_db.duration if song_db and song_db.duration else 180)
            songs_data.append({
                "public_id": public_id,
                "title": title,
                "url": res["secure_url"],
                "type": res["resource_type"],
                "genre": category_name,
                "artist": artist_name,
                "bytes": duration
            })
        return jsonify({"songs": songs_data})

    except Exception as e:
        print("Error:", str(e))
        return jsonify({"error": str(e)}), 500


@api.route("/delete-song/<root>/<category>/<cloudinary_id>", methods=["DELETE"])
def delete_song(root, category, cloudinary_id):
    global songs
    cloudinary_id = root + "/" + category + "/" + cloudinary_id
    print(cloudinary_id)
    songs = [s for s in songs if s["cloudinary_id"] != cloudinary_id]

    try:
        cloudinary.uploader.destroy(cloudinary_id, resource_type="video")
    except Exception:
        pass

    return jsonify({"message": "Canción eliminada"}), 200


@api.route("/delete-category/<category_name>", methods=["DELETE"])
def delete_category(category_name):
    global songs
    songs = [s for s in songs if s["genre"] != category_name]
    folder = "music/" + category_name.strip().lower() + "/"
    try:
        resources = cloudinary.api.resources(
            type="upload",
            resource_type="video",
            prefix=folder,
            max_results=100
        )
        for res in resources.get("resources", []):
            cloudinary.uploader.destroy(res["public_id"], resource_type="video")
    except Exception:
        pass

    return jsonify({"message": f"Categoría '{category_name}' eliminada con todas sus canciones"}), 200


@api.route("/create-folder/<folder_name>", methods=["POST"])
def create_folder(folder_name):
    try:
        dummy_data_url = (
            "data:video/mp4;base64,"
            "AAAAHGZ0eXBtcDQyAAAAAG1wNDFtcDQyaXNvbWF2YzEAAAAIZnJlZQAAACBtZGF0AAAAAA=="
        )

        folder_path = f"music/{folder_name.strip()}/"
        upload_result = cloudinary.uploader.upload(
            dummy_data_url,
            resource_type="raw",
            folder=folder_path,
            public_id=folder_name.strip(),
            overwrite=True
        )

        cloudinary.uploader.destroy(
            upload_result["public_id"],
            resource_type="raw"
        )

        return jsonify({"message": f"Carpeta '{folder_name}' creada exitosamente"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api.route("/folders", methods=["GET"])
def get_all_folders():
    try:
        folders = []
        next_cursor = None

        while True:
            result = cloudinary.api.subfolders("music",
                                               prefix="music",
                                               next_cursor=next_cursor
                                               )

            folders.extend([folder["name"] for folder in result.get("folders", [])])

            next_cursor = result.get("next_cursor")
            if not next_cursor:
                break

        return jsonify({"folders": folders}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


from flask import Response


@api.route("/proxy-cloudinary/<path:public_id>")
def proxy_cloudinary(public_id):
    try:
        url, options = cloudinary.utils.cloudinary_url(
            public_id,
            resource_type="video",
            secure=True
        )
        # Lee el Range que llega del navegador
        headers = {}
        if request.headers.get('Range'):
            headers['Range'] = request.headers['Range']

        # Pide el recurso a Cloudinary con el header adecuado
        resp = requests.get(url, headers=headers, stream=True)
        resp.raise_for_status()

        # Construye la respuesta con los mismos headers importantes
        response = Response(resp.raw, status=resp.status_code, content_type=resp.headers.get('Content-Type'))
        # Copia los headers de rango si existen
        if 'Content-Range' in resp.headers:
            response.headers['Content-Range'] = resp.headers['Content-Range']
        if 'Accept-Ranges' in resp.headers:
            response.headers['Accept-Ranges'] = resp.headers['Accept-Ranges']
        if 'Content-Length' in resp.headers:
            response.headers['Content-Length'] = resp.headers['Content-Length']

        # CORS
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Range"
        response.headers["Access-Control-Allow-Methods"] = "GET"

        return response

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api.route("/todos-los-temas", methods=["GET"])
def obtener_todas_las_canciones():
    try:
        canciones = Song.query.all()
        data = [{
            "title": song.title,
            "artist": song.artist,
            "genre": song.genre,
            "public_id": song.public_id
        } for song in canciones]

        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
