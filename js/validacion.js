// validacion.js — Registro e inicio de sesión del cliente
// Funciones: iniciarSesion(event) y validarFormulario(event)
// Usadas directamente por onsubmit en cuenta.html

var API_BASE = 'http://pizzhawaiiana-001-site1.qtempurl.com/api';

// ── Anti-negativos: bloquear teclas y limpiar no-dígitos en teléfonos ──────────
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('input[type="tel"], input[inputmode="numeric"]').forEach(function (inp) {
        inp.addEventListener('input', function () {
            this.value = this.value.replace(/[^0-9]/g, '').slice(0, 10);
        });
        inp.addEventListener('keydown', function (e) {
            if (e.key === '-' || e.key === 'e' || e.key === '+' || e.key === '.') e.preventDefault();
        });
    });
});

// ── Helpers de validación ─────────────────────────────────────────────────────

function mostrarErrorSpan(id, msg) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent  = msg;
    el.style.display = msg ? 'block' : 'none';
}

function limpiarErrores() {
    ['error-nombre','error-apellido','error-telefono','error-password','error-login'].forEach(function (id) {
        mostrarErrorSpan(id, '');
    });
}

// ── LOGIN de cliente ───────────────────────────────────────────────────────────

async function iniciarSesion(event) {
    if (event) event.preventDefault();
    limpiarErrores();

    var nombre = (document.getElementById('login-nombre')?.value   || '').trim();
    var tel    = (document.getElementById('login-telefono')?.value  || '').replace(/[^0-9]/g, '');
    var pass   = (document.getElementById('login-password')?.value  || '');

    var hayError = false;
    if (!nombre) { mostrarErrorSpan('error-nombre', 'El nombre es obligatorio.'); hayError = true; }
    if (tel.length !== 10) { mostrarErrorSpan('error-telefono', 'El teléfono debe tener exactamente 10 dígitos.'); hayError = true; }
    if (hayError) return false;

    var btn = document.querySelector('#form-login button[type="submit"]');
    var textoOrig = btn ? btn.innerHTML : 'Entrar';
    if (btn) { btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; btn.disabled = true; }

    try {
        var res = await fetch(API_BASE + '/clientes/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: nombre, telefono: tel, password: pass })
        });
        var data = await res.json();
        if (!res.ok) {
            mostrarErrorSpan('error-telefono', data.mensaje || 'Credenciales incorrectas.');
            return false;
        }
        localStorage.removeItem('empleadoHawaiiana'); // Limpiar sesión de empleado si existía
        localStorage.setItem('clienteHawaiiana', JSON.stringify(data));
        window.location.href = 'menu.html';
    } catch (err) {
        mostrarErrorSpan('error-telefono', 'Error de conexión con el servidor.');
    } finally {
        if (btn) { btn.innerHTML = textoOrig; btn.disabled = false; }
    }
    return false;
}

// ── REGISTRO de cliente ───────────────────────────────────────────────────────

async function validarFormulario(event) {
    if (event) event.preventDefault();
    limpiarErrores();

    // IDs reales del HTML de cuenta.html
    var nombre   = (document.getElementById('nombre')?.value           || '').trim();
    var apellidoCompleto = (document.getElementById('apellido')?.value || '').trim();
    var partesApellido   = apellidoCompleto.split(/\s+/);
    var apPaterno        = partesApellido[0] || '';
    var apMaterno        = partesApellido.slice(1).join(' ') || '';
    var tel      = (document.getElementById('telefono')?.value         || '').replace(/[^0-9]/g, '');
    var pass     = (document.getElementById('password-registro')?.value|| '');

    var hayError = false;
    if (!nombre)          { mostrarErrorSpan('error-nombre',   'El nombre es obligatorio.');         hayError = true; }
    if (!apPaterno)      { mostrarErrorSpan('error-apellido', 'El apellido es obligatorio.');      hayError = true; }
    if (tel.length !== 10){ mostrarErrorSpan('error-telefono', 'Debe tener exactamente 10 dígitos.'); hayError = true; }
    if (pass.length < 6)  { mostrarErrorSpan('error-password', 'Mínimo 6 caracteres.');              hayError = true; }
    if (hayError) return false;

    var btn = document.querySelector('#form-registro button[type="submit"]');
    var textoOrig = btn ? btn.innerHTML : 'Registrarme';
    if (btn) { btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; btn.disabled = true; }

    try {
        var res = await fetch(API_BASE + '/clientes/registro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: nombre, apPaterno: apPaterno, apMaterno: apMaterno, telefono: tel, password: pass })
        });
        var data = await res.json();
        if (!res.ok) {
            mostrarErrorSpan('error-telefono', data.mensaje || 'Error al registrarse.');
            return false;
        }
        var exito = document.getElementById('msg-exito');
        if (exito) exito.style.display = 'block';
        localStorage.removeItem('empleadoHawaiiana');
        localStorage.setItem('clienteHawaiiana', JSON.stringify(data));
        setTimeout(function () { window.location.href = 'menu.html'; }, 1200);
    } catch (err) {
        mostrarErrorSpan('error-telefono', 'Error de conexión con el servidor.');
    } finally {
        if (btn) { btn.innerHTML = textoOrig; btn.disabled = false; }
    }
    return false;
}
