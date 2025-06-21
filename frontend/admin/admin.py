from flask import Blueprint, render_template

admin_bp = Blueprint('admin', __name__, url_prefix='/admin', template_folder="/templates/main")


@admin_bp.route('/')
def dashboard():
    return render_template('main/admin.html')


@admin_bp.route('/live')
def live():
    return render_template('main/live.html')


@admin_bp.route('/programacion')
def programacion():
    horas = list(range(24))
    return render_template('main/programacion.html', horas=horas)


@admin_bp.route('/canciones')
def canciones():
    return render_template('canciones.html')
