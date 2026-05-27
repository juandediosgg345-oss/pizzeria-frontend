// cuenta.js — Login de cliente (nombre + teléfono + contraseña)
var API_BASE = 'http://pizzhawaiiana-001-site1.qtempurl.com/api';

document.addEventListener('DOMContentLoaded', function () {
    verificarSesionActiva();
});

// Si hay sesión activa, oculta los formularios y muestra el panel de bienvenida
function verificarSesionActiva() {
    var cliente = JSON.parse(localStorage.getItem('clienteHawaiiana') || 'null');
    if (!cliente) return;

    document.getElementById('panel-formularios').style.display   = 'none';
    document.getElementById('panel-sesion-activa').style.display = 'block';

    var elNombre = document.getElementById('nombre-sesion');
    if (elNombre) elNombre.textContent = cliente.nombre || '—';
}


// Elimina la sesión del cliente y recarga la página
function cerrarSesion() {
    if (!confirm('¿Cerrar sesión?')) return;
    localStorage.removeItem('clienteHawaiiana');
    window.location.reload();
}
