import eventlet
eventlet.monkey_patch()
import json
from flask import Flask, render_template
from flask_socketio import SocketIO, emit
from backend.song import Programacion
from frontend.admin.admin import admin_bp
from main import api
from db import db

app = Flask(__name__)

app.config['SQLALCHEMY_DATABASE_URI'] = ('postgresql://emisora_user:3tOhA7zjcj2qrpgMXcjipNcePrSuEUFl@dpg'
                                         '-d1b35r3e5dus73e69flg-a.oregon-postgres.render.com/emisora')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

app.config['SECRET_KEY'] = 'supersecret'
db.init_app(app)

with app.app_context():
    db.create_all()

socketio = SocketIO(app, cors_allowed_origins="*")


@app.route('/')
def index():
    return render_template('main/index.html')


@app.route('/en-vivo')
def onLive():
    return render_template('main/en-vivo.html')


@app.route('/contacto')
def contact():
    return render_template('main/contacto.html')


@app.route('/programacion')
def programacion():
    horas = list(range(24))
    programaciones = Programacion.query.all()
    programacion_dict = {
        int(p.hora): json.loads(p.canciones)
        for p in programaciones
    }

    return render_template(
        'main/programacion-user.html',
        horas=horas,
        programacion=programacion_dict
    )

@app.route('/locutores')
def speakers():
    return render_template('main/locutores.html')


# Registro de Blueprints
app.register_blueprint(api, url_prefix='/api')
app.register_blueprint(admin_bp)


# Eventos Socket.IO
@socketio.on('connect')
def handle_connect():
    print('Cliente conectado')


@socketio.on('disconnect')
def handle_disconnect():
    print('Cliente desconectado')


@socketio.on('chat-message')
def handle_chat_message(msg):
    emit('chat-message', msg, broadcast=True)


@socketio.on('delete-message')
def handle_delete_message(msg_id):
    emit('delete-message', msg_id, broadcast=True)


message_reactions = {}


@socketio.on('reaction')
def handle_reaction(data):
    msg_id = data['messageId']
    emoji = data['emoji']

    if msg_id not in message_reactions:
        message_reactions[msg_id] = {}

    if emoji not in message_reactions[msg_id]:
        message_reactions[msg_id][emoji] = 0

    message_reactions[msg_id][emoji] += 1

    count = message_reactions[msg_id][emoji]

    emit('reaction', {'messageId': msg_id, 'emoji': emoji, 'count': count}, broadcast=True)


@socketio.on('typing')
def handle_typing(data):
    emit('typing', data, broadcast=True, include_self=False)


@socketio.on('stop-typing')
def handle_stop_typing(data):
    emit('stop-typing', data, broadcast=True, include_self=False)


@socketio.on('broadcast-audio')
def handle_broadcast_audio(data):
    emit('broadcast-audio', data, broadcast=True, include_self=False)


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
