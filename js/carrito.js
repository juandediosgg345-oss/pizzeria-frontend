// carrito.js — Carrito de compras: lógica local + checkout al API
var API_BASE = '/api';
var CLAVE_CARRITO = 'carritoHawaiiana';
var CLAVE_PEDIDOS = 'pedidosHawaiiana';

var ICONOS_ESTADO = {
    preparacion: { texto: 'En preparación',  icono: 'bi-bag-fill',          tiempo: '25–35 min' },
    camino:      { texto: 'En camino',        icono: 'bi-truck',             tiempo: '10–15 min' },
    entregado:   { texto: 'Entregado',        icono: 'bi-check-circle-fill', tiempo: '—'         }
};

// --- Operaciones básicas del carrito ---

function obtenerCarrito() {
    try { return JSON.parse(localStorage.getItem(CLAVE_CARRITO) || '[]'); }
    catch (e) { return []; }
}

function guardarCarrito(c) {
    localStorage.setItem(CLAVE_CARRITO, JSON.stringify(c));
    renderCarrito();
    if (typeof actualizarBadgesGlobal === 'function') actualizarBadgesGlobal();
}

function cambiarCantidad(clave, delta) {
    var carrito = obtenerCarrito();
    var item    = carrito.find(function (i) { return i.clave === clave; });
    if (!item) return;
    item.cantidad += delta;
    if (item.cantidad <= 0) carrito = carrito.filter(function (i) { return i.clave !== clave; });
    guardarCarrito(carrito);
}

function eliminarItem(clave) {
    guardarCarrito(obtenerCarrito().filter(function (i) { return i.clave !== clave; }));
}

function vaciarCarrito() {
    if (!confirm('¿Vaciar el carrito?')) return;
    guardarCarrito([]);
}

// --- Render de la lista de productos ---

function renderCarrito() {
    var carrito    = obtenerCarrito();
    var contenedor = document.getElementById('lista-carrito');
    var secVacia   = document.getElementById('carrito-vacio');
    var secItems   = document.getElementById('carrito-con-items');
    if (!contenedor) return;

    if (carrito.length === 0) {
        if (secVacia) secVacia.style.display = 'block';
        if (secItems) secItems.style.display = 'none';
        actualizarTotales(0);
        return;
    }

    if (secVacia) secVacia.style.display = 'none';
    if (secItems) secItems.style.display = 'block';

    contenedor.innerHTML = '';
    var total = 0;

    carrito.forEach(function (item) {
        var sub = item.precio * item.cantidad;
        total += sub;

        var fila = document.createElement('div');
        // Se aplica flex-wrap y justify-content-between para que se adapte en móviles
        fila.className = 'd-flex flex-wrap align-items-center justify-content-between gap-3 py-3';
        fila.style.borderBottom = '1px solid var(--border-tarjeta)';
        
        fila.innerHTML = `
            <div class="d-flex align-items-center flex-grow-1" style="min-width: 150px;">
                <div style="font-size:1.8rem; flex-shrink:0;" class="me-3">
                    <i class="bi bi-bag-fill texto-acento"></i>
                </div>
                <div class="min-w-0">
                    <p class="texto-principal mb-0 text-truncate"><strong>${item.nombre}</strong></p>
                    <small class="texto-secundario">${item.tamanio || ''} · $${item.precio} c/u</small>
                    ${item.observaciones ? `<br><small style="color:#e67e22;font-size:.8em;"><i class="bi bi-chat-left-text"></i> ${item.observaciones}</small>` : ''}
                </div>
            </div>

            <div class="d-flex align-items-center gap-3 ms-auto">
                <div class="d-flex align-items-center gap-1 flex-shrink-0">
                    <button type="button" class="btn btn-sm btn-outline-secondary px-2" style="min-width:28px;" onclick="cambiarCantidad('${item.clave}',-1)">−</button>
                    <span class="texto-principal fw-bold px-1">${item.cantidad}</span>
                    <button type="button" class="btn btn-sm btn-outline-secondary px-2" style="min-width:28px;" onclick="cambiarCantidad('${item.clave}',1)">+</button>
                </div>
                <span class="precio-destacado flex-shrink-0" style="min-width:56px; text-align:right;">$${sub.toFixed(2)}</span>
                <button type="button" class="btn btn-sm btn-outline-danger px-2 flex-shrink-0" onclick="eliminarItem('${item.clave}')">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
        `;

        contenedor.appendChild(fila);
    });

    actualizarTotales(total);
}

function actualizarTotales(subtotal) {
    var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    set('subtotal-carrito', '$' + subtotal.toFixed(2));
    set('envio-carrito',    'Gratis');
    set('total-carrito',    '$' + subtotal.toFixed(2));
}

// --- Formulario de pedido ---

var _sesionCliente      = null;
var _direccionesCliente = [];

async function inicializarFormularioPedido() {
    _sesionCliente = JSON.parse(localStorage.getItem('clienteHawaiiana') || 'null');

    var secDatos = document.getElementById('seccion-datos-pedido');
    var secLogin = document.getElementById('seccion-requiere-login');
    var btnPagar = document.getElementById('btn-pagar');

    if (!_sesionCliente) {
        if (secDatos)  secDatos.style.display  = 'none';
        if (secLogin)  secLogin.style.display  = 'block';
        if (btnPagar)  btnPagar.style.display  = 'none';
        return;
    }

    if (secDatos)  secDatos.style.display  = 'block';
    if (secLogin)  secLogin.style.display  = 'none';
    if (btnPagar)  btnPagar.style.display  = 'block';

    var inputNombre = document.getElementById('ped-nombre');
    if (inputNombre) {
        inputNombre.value    = _sesionCliente.nombre + ' ' + (_sesionCliente.apPaterno || '');
        inputNombre.readOnly = true;
    }
    var inputTel = document.getElementById('ped-tel');
    if (inputTel) {
        inputTel.value    = _sesionCliente.telefono || '';
        inputTel.readOnly = true;
    }

    await cargarDireccionesParaPedido();
}

async function cargarDireccionesParaPedido() {
    if (!_sesionCliente) return;
    var secDir = document.getElementById('seccion-direccion');
    if (!secDir) return;

    try {
        const res = await fetch(`${API_BASE}/clientes/${_sesionCliente.idCliente}/direcciones`);
        if (!res.ok) throw new Error();
        _direccionesCliente = await res.json();
    } catch (e) { _direccionesCliente = []; }

    secDir.innerHTML = '';

    if (_direccionesCliente.length === 0) {
        secDir.innerHTML =
            '<div class="alert alert-warning py-2 mb-2" style="font-size:.88em;">' +
            '<i class="bi bi-geo-alt"></i> No tienes direcciones guardadas. ' +
            '<a href="micuenta.html" style="color:inherit;font-weight:bold;">Agrégalas en Mi Cuenta</a>.</div>' +
            '<div class="mb-2"><label class="form-label texto-principal">Calle *</label>' +
            '<input type="text" class="form-control" id="ped-calle" placeholder="Calle"></div>' +
            '<div class="row g-2 mb-2"><div class="col-8">' +
            '<label class="form-label texto-principal">Colonia *</label>' +
            '<input type="text" class="form-control" id="ped-colonia" placeholder="Colonia"></div>' +
            '<div class="col-4"><label class="form-label texto-principal">Número *</label>' +
            '<input type="text" class="form-control" id="ped-numExterior" placeholder="45"></div></div>' +
            '<div class="mb-2"><label class="form-label texto-principal">Referencia</label>' +
            '<input type="text" class="form-control" id="ped-referencia" placeholder="Casa azul..."></div>';
        return;
    }

    var opts = _direccionesCliente.map(function (d, i) {
        return '<option value="' + d.idDireccion + '">' +
               (d.alias || ('Dirección ' + (i + 1))) + ' — ' + d.calle + ' #' + d.numExterior + ', ' + d.colonia +
               '</option>';
    }).join('');

    secDir.innerHTML =
        '<div class="mb-2"><label class="form-label texto-principal">' +
        '<i class="bi bi-geo-alt-fill"></i> Dirección de entrega</label>' +
        '<select class="form-select" id="select-direccion">' + opts + '</select></div>' +
        '<a href="micuenta.html" class="btn btn-sm btn-outline-secondary mb-2">' +
        '<i class="bi bi-plus-lg"></i> Administrar direcciones</a>';

    // Respetar el tipo ya seleccionado al cargar (local = sin dirección)
    toggleFormEntrega();
}

function toggleFormEntrega() {
    var tipo   = document.getElementById('tipo-entrega');
    var secDir = document.getElementById('seccion-direccion');
    if (!tipo || !secDir) return;
    secDir.style.display = tipo.value === 'domicilio' ? 'block' : 'none';
    var sub = obtenerCarrito().reduce(function (a, i) { return a + i.precio * i.cantidad; }, 0);
    actualizarTotales(sub);
}

// --- Inicialización ---

document.addEventListener('DOMContentLoaded', function () {
    renderCarrito();
    mostrarEstadoUltimoPedido();
    inicializarFormularioPedido();
    var tipoEl = document.getElementById('tipo-entrega');
    if (tipoEl) tipoEl.addEventListener('change', toggleFormEntrega);
});

// --- Checkout ---

async function enviarPedido(evento) {
    var e = evento || window.event;
    if (e) e.preventDefault();

    var carrito = obtenerCarrito();
    if (carrito.length === 0) { alert('Tu carrito está vacío.'); return false; }

    if (!_sesionCliente) {
        alert('Por favor, inicia sesión para poder pedir.');
        window.location.href = 'cuenta.html';
        return false;
    }

    var tipoEntrega = document.getElementById('tipo-entrega') ? document.getElementById('tipo-entrega').value : 'local';
    var metodoPago  = document.getElementById('metodo-pago')  ? document.getElementById('metodo-pago').value  : 'efectivo';
    var idDireccion = null;
    if (tipoEntrega === 'domicilio') {
        var selectDir = document.getElementById('select-direccion');
        if (selectDir) idDireccion = selectDir.value || null;
    }

    var btn       = document.getElementById('btn-pagar');
    var textoOrig = btn ? btn.innerHTML : 'Confirmar Pedido';
    if (btn) { btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Procesando...'; btn.disabled = true; }

    try {
        var payload = {
            idCliente:   _sesionCliente.idCliente,
            tipoEntrega: tipoEntrega,
            metodoPago:  metodoPago,
            idDireccion: idDireccion,
            detalles: carrito.map(function (item) {
                return { idProducto: item.id, cantidad: item.cantidad, precioUnitario: item.precio, observaciones: item.observaciones && item.observaciones.trim() ? item.observaciones.trim() : null };
            })
        };

        const response = await fetch(`${API_BASE}/pedidos`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        });
        const data = await response.json();

        if (response.ok) {
            var pedidoConfirmado = {
                id:          data.idPedido,
                tipoEntrega: tipoEntrega,
                metodoPago:  metodoPago,
                total:       data.total,
                horaPedido:  new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
                estado:      'preparacion'
            };
            var historial = JSON.parse(localStorage.getItem(CLAVE_PEDIDOS) || '[]');
            historial.unshift(pedidoConfirmado);
            localStorage.setItem(CLAVE_PEDIDOS, JSON.stringify(historial));
            localStorage.removeItem(CLAVE_CARRITO);
            if (typeof actualizarBadgesGlobal === 'function') actualizarBadgesGlobal();
            mostrarConfirmacion(pedidoConfirmado);
            alert('¡Pedido realizado! Folio: ' + data.idPedido);
            window.scrollTo(0, 0);
        } else {
            alert('Aviso: ' + (data.mensaje || 'Error al procesar el pedido.'));
        }
    } catch (error) {
        console.error(error);
        alert('No se pudo conectar con la pizzería. Verifica que el servidor esté encendido.');
    } finally {
        if (btn) { btn.innerHTML = textoOrig; btn.disabled = false; }
    }
    return false;
}

function mostrarConfirmacion(pedido) {
    var secForm    = document.getElementById('seccion-pedido');
    var secConfirm = document.getElementById('seccion-confirmacion');
    if (secForm)    secForm.style.display    = 'none';
    if (secConfirm) secConfirm.style.display = 'block';

    var metodos = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
    var tipos   = { domicilio: 'A domicilio', local: 'Recoger en sucursal' };
    var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };

    set('confirm-id',     pedido.id);
    set('confirm-tipo',   tipos[pedido.tipoEntrega]  || pedido.tipoEntrega);
    set('confirm-metodo', metodos[pedido.metodoPago] || pedido.metodoPago);
    set('confirm-total',  '$' + (pedido.total || 0).toFixed(2));
    set('confirm-hora',   pedido.horaPedido);
    renderCarrito();
}

// --- Seguimiento del último pedido (consulta estado real desde la API) ---
async function mostrarEstadoUltimoPedido() {
    var cliente = JSON.parse(localStorage.getItem('clienteHawaiiana') || 'null');

    // Sin sesión activa: limpiar historial local y no mostrar nada
    if (!cliente) {
        localStorage.removeItem(CLAVE_PEDIDOS);
        return;
    }

    var historial = JSON.parse(localStorage.getItem(CLAVE_PEDIDOS) || '[]');
    if (!historial.length) return;

    // Limpiar entradas inválidas (sin id) al inicio del historial
    while (historial.length > 0 && (!historial[0] || !historial[0].id)) {
        historial.shift();
    }
    if (!historial.length) {
        localStorage.setItem(CLAVE_PEDIDOS, JSON.stringify(historial));
        return;
    }

    var ultimo = historial[0];

    // Consultar el estado REAL del pedido en la API (evita mostrar estado obsoleto)
    try {
        const res = await fetch(API_BASE + '/pedidos/' + ultimo.id);

        if (!res.ok) {
            // El pedido ya no existe en la BD → limpiar de localStorage y ocultar
            historial.shift();
            localStorage.setItem(CLAVE_PEDIDOS, JSON.stringify(historial));
            return;
        }

        const data = await res.json();

        // Si el pedido ya fue entregado o cancelado → quitarlo del seguimiento y ocultar sección
        if (data.estado === 'Entregado' || data.estado === 'Cancelado') {
            historial.shift();
            localStorage.setItem(CLAVE_PEDIDOS, JSON.stringify(historial));
            return;
        }

        // Actualizar el estado local con el valor real de la API
        var mapaEstado = { 'Preparando': 'preparacion', 'En camino': 'camino' };
        historial[0].estado = mapaEstado[data.estado] || 'preparacion';
        localStorage.setItem(CLAVE_PEDIDOS, JSON.stringify(historial));
        ultimo = historial[0];

    } catch (e) {
        // Si la API no responde, usar el estado guardado localmente sin ocultar la sección
        console.warn('No se pudo verificar el estado del pedido con la API.', e);
    }

    var secEstado = document.getElementById('seccion-estado');
    if (!secEstado) return;

    var d   = ICONOS_ESTADO[ultimo.estado] || ICONOS_ESTADO.preparacion;
    var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };

    var iconoEl = document.getElementById('estado-icono');
    if (iconoEl) iconoEl.innerHTML = '<i class="bi ' + d.icono + '"></i>';

    set('estado-texto',  d.texto);
    set('estado-tiempo', d.tiempo);
    set('estado-id',     ultimo.id || '—');
    set('estado-metodo', { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' }[ultimo.metodoPago] || '—');

    secEstado.style.display = 'block';
}
