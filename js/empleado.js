// empleado.js — Login de empleados y sesión activa
var API_BASE = '/api';
var RUTAS_CARGO = {
    Gerente:    'inicio.html',
    Cajero:     'pos.html',
    Repartidor: 'repartidor.html',
    Cocinero:   'cocina.html'
};

document.addEventListener('DOMContentLoaded', function () {
    verificarSesionEmpleado();
    // La forma tiene onsubmit inline, no necesita addEventListener
    // Pero prevenimos negativos en el teléfono
    var telInput = document.getElementById('emp-telefono');
    if (telInput) {
        telInput.addEventListener('input', function () {
            this.value = this.value.replace(/\D/g, '').slice(0, 10);
        });
        telInput.addEventListener('keydown', function (e) {
            if (e.key === '-' || e.key === 'e' || e.key === '+') e.preventDefault();
        });
    }
});

function verificarSesionEmpleado() {
    var empleado = JSON.parse(localStorage.getItem('empleadoHawaiiana') || 'null');
    if (!empleado) return;

    var panelLogin  = document.getElementById('panel-login');
    var panelActivo = document.getElementById('panel-sesion-activa');
    if (panelLogin)  panelLogin.style.display  = 'none';
    if (panelActivo) panelActivo.style.display = 'block';

    var elNombre = document.getElementById('nombre-empleado');
    var elCargo  = document.getElementById('cargo-empleado');
    var btnPanel = document.getElementById('btn-ir-panel');

    if (elNombre) elNombre.textContent = empleado.nombre || '—';
    if (elCargo)  elCargo.textContent  = 'Cargo: ' + (empleado.cargo || '—');
    if (btnPanel) btnPanel.href        = RUTAS_CARGO[empleado.cargo] || 'inicio.html';

    var esAdmin  = empleado.cargo === 'Gerente' || empleado.cargo === 'Administrador';
    var divAdmin = document.getElementById('accesos-gerente');
    if (divAdmin) divAdmin.style.display = esAdmin ? 'block' : 'none';
    if (btnPanel && esAdmin) {
        btnPanel.innerHTML = '<i class="bi bi-grid-3x3-gap-fill"></i> Selector de Módulos';
    }
}

async function iniciarSesionEmpleado(event) {
    if (event) event.preventDefault();

    // IDs reales del HTML: emp-id y emp-telefono
    var id  = (document.getElementById('emp-id')?.value || '').trim().toUpperCase();
    var tel = (document.getElementById('emp-telefono')?.value || '').replace(/\D/g, '');

    // Limpiar error anterior
    mostrarErrorLogin('');

    if (!id)  { mostrarErrorLogin('Ingresa tu ID de empleado.'); return false; }
    if (tel.length !== 10) { mostrarErrorLogin('El teléfono debe tener exactamente 10 dígitos.'); return false; }

    var btn = document.querySelector('#form-empleado button[type="submit"]');
    var textoOrig = btn ? btn.innerHTML : 'Acceder';
    if (btn) { btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Verificando...'; btn.disabled = true; }

    try {
        var res = await fetch(API_BASE + '/empleados/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idEmpleado: id, telefono: tel })
        });

        if (!res.ok) {
            var err = {};
            try { err = await res.json(); } catch (e) {}
            mostrarErrorLogin(err.mensaje || 'Credenciales incorrectas o empleado inactivo.');
            return false;
        }

        var empleado = await res.json();
        localStorage.setItem('empleadoHawaiiana', JSON.stringify({
            idEmpleado:   empleado.idEmpleado,
            nombre:       empleado.nombre,
            apPaterno:    empleado.apPaterno,
            cargo:        empleado.cargo,
            telefono:     empleado.telefono,
            idRepartidor: empleado.idRepartidor || null
        }));

        window.location.href = RUTAS_CARGO[empleado.cargo] || 'inicio.html';

    } catch (err) {
        mostrarErrorLogin('Error de conexión. Verifica que el servidor esté activo.');
    } finally {
        if (btn) { btn.innerHTML = textoOrig; btn.disabled = false; }
    }
    return false;
}

function mostrarErrorLogin(msg) {
    // Buscar elemento de error existente o mostrar alert
    var el = document.getElementById('error-login-emp') ||
             document.getElementById('error-empleado') ||
             document.querySelector('.alerta-login-emp');
    if (el) {
        el.textContent  = msg;
        el.style.display = msg ? 'block' : 'none';
    } else if (msg) {
        alert(msg);
    }
}

function cerrarSesionEmpleado() {
    if (!confirm('¿Cerrar sesión?')) return;
    localStorage.removeItem('empleadoHawaiiana');
    window.location.href = 'empleado.html';
}
