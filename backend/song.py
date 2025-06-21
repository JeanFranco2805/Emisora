from db import db


class Song(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    public_id = db.Column(db.String, unique=True, nullable=False)
    title = db.Column(db.String, nullable=False)
    artist = db.Column(db.String, nullable=False)
    genre = db.Column(db.String, nullable=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now())


class Programacion(db.Model):
    __tablename__ = 'programacion'
    id = db.Column(db.Integer, primary_key=True)
    hora = db.Column(db.Integer, nullable=False)
    canciones = db.Column(db.Text, nullable=False)  # Guardaremos como JSON string
