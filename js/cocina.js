var _pedidosEnCocina = [];
// cocina.js — Panel de cocina
var API_BASE = 'http://pizzhawaiiana-001-site1.qtempurl.com/api';
var _empleado = null;
var _timer    = null;

document.addEventListener('DOMContentLoaded', function () {
    _empleado = JSON.parse(localStorage.getItem('empleadoHawaiiana') || 'null');

    var cargosPermitidos = ['Cocinero', 'Gerente', 'Administrador'];
    if (!_empleado || !cargosPermitidos.includes(_empleado.cargo)) {
        window.location.href = 'empleado.html'; return;
    }

    var nombre = (_empleado.nombre || '') + ' ' + (_empleado.apPaterno || '');
    var setNombre = function (id) { var el = document.getElementById(id); if (el) el.textContent = nombre.trim(); };
    setNombre('nombre-cocinero');
    setNombre('nombre-cocinero-mov');

    // Mostrar botón Módulos solo para Gerente/Administrador
    if (_empleado.cargo === 'Gerente' || _empleado.cargo === 'Administrador') {
        // setTimeout pequeño para asegurar que el DOM esté listo después de global.js
        setTimeout(function() {
            var btn = document.getElementById('btn-modulos-cocina');
            if (btn) btn.style.display = 'inline-flex';
        }, 100);
    }

    cargarPedidosCocina();
    _timer = setInterval(cargarPedidosCocina, 30000); // auto-refresh cada 30 s
});

async function cargarPedidosCocina() {
    try {
        var res     = await fetch(API_BASE + '/pedidos?estado=' + encodeURIComponent('En cocina'));
        var pedidos = await res.json();
    _pedidosEnCocina = pedidos;

        var badge = document.getElementById('badge-pendientes');
        if (badge) badge.textContent = pedidos.length + ' pendiente' + (pedidos.length !== 1 ? 's' : '');

        var lbl = document.getElementById('lbl-refresh');
        if (lbl) lbl.textContent = 'Actualizado: ' + new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        await renderPedidosCocina(pedidos);
    } catch (err) {
        console.error('Error al cargar cocina:', err);
    }
}

async function renderPedidosCocina(pedidos) {
    var grid = document.getElementById('grid-cocina');
    if (!grid) return;

    if (!pedidos.length) {
        grid.innerHTML =
            '<div class="col-12"><div class="tarjeta-tema p-5 text-center">' +
            '<i class="bi bi-check-circle-fill texto-acento" style="font-size:3.5rem;"></i>' +
            '<h4 class="mt-3 texto-principal">¡Todo al día!</h4>' +
            '<p class="texto-secundario mb-0">No hay pedidos pendientes en cocina.</p>' +
            '</div></div>';
        return;
    }

    grid.innerHTML = '';

    // Obtener detalles en paralelo
    var detallesMap = {};
    await Promise.all(pedidos.map(async function (p) {
        try {
            var r = await fetch(API_BASE + '/pedidos/' + p.idPedido);
            var d = await r.json();
            detallesMap[p.idPedido] = d.detalles || [];
        } catch (e) { detallesMap[p.idPedido] = []; }
    }));

    pedidos.forEach(function (p) {
        var detalles = detallesMap[p.idPedido] || [];

        // Tiempo transcurrido
        var elapsed = '';
        try {
            var partes = (p.horaPedido || '00:00').split(':');
            var fechaP = new Date(); fechaP.setHours(+partes[0], +partes[1], 0, 0);
            var diff   = Math.round((Date.now() - fechaP) / 60000);
            elapsed = diff >= 0 ? diff + ' min' : '0 min';
        } catch (e) {}

        var tipoIcon = p.tipoEntrega === 'domicilio'
            ? '<i class="bi bi-scooter text-info"></i>'
            : '<i class="bi bi-shop"></i>';

        var productosHTML = detalles.map(function (d) {
            return '<div class="py-2 border-bottom">' +
                '<div class="d-flex align-items-center gap-2">' +
                '<span class="badge bg-secondary">' + d.cantidad + 'x</span>' +
                '<strong class="texto-principal">' + d.nombreProducto + '</strong>' +
                (d.tamanio && d.tamanio !== 'Único' ? '<small class="texto-secundario">(' + d.tamanio + ')</small>' : '') +
                '</div>' +
                (d.observaciones ? '<div class="mt-1 ps-4"><small class="text-warning"><i class="bi bi-chat-left-text me-1"></i>' + d.observaciones + '</small></div>' : '') +
                '</div>';
        }).join('');

        var col = document.createElement('div');
        col.className = 'col-md-6 col-xl-4';
        col.innerHTML =
            '<div class="tarjeta-tema p-3 h-100 d-flex flex-column" style="border-top:4px solid var(--color-acento);">' +
            // Cabecera del pedido
            '<div class="d-flex justify-content-between align-items-start mb-3">' +
            '<div>' +
            '<h3 class="texto-acento fw-bold mb-0">' + p.idPedido + '</h3>' +
            '<span class="texto-secundario small">' + tipoIcon + ' ' + (p.tipoEntrega === 'domicilio' ? 'Domicilio' : 'Local') + ' · ' + (p.horaPedido || '') + '</span>' +
            '</div>' +
            '<div class="text-end">' +
            '<span class="badge ' + (parseInt(elapsed) >= 20 ? 'bg-danger' : 'bg-warning text-dark') + ' fs-6">' + elapsed + '</span>' +
            '</div>' +
            '</div>' +
            // Lista de productos
            '<div class="flex-grow-1 mb-3">' +
            (productosHTML || '<p class="texto-secundario">Sin detalles</p>') +
            '</div>' +
            // Botón listo
            '<button class="btn btn-success w-100 py-2 fw-bold fs-5" id="btn-listo-' + p.idPedido + '" onclick="marcarListo(\'' + p.idPedido + '\')">' +
            '<i class="bi bi-check-circle-fill me-2"></i>¡LISTO!' +
            '</button>' +
            '</div>';
        grid.appendChild(col);
    });
}

async function marcarListo(idPedido) {
    var btn = document.getElementById('btn-listo-' + idPedido);
    if (btn) { btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Procesando...'; btn.disabled = true; }
    try {
        // Pedidos de mostrador: al marcar Listo pasan directo a Entregado (sin repartidor)
        var pedido      = _pedidosEnCocina.find(function(p){ return p.idPedido === idPedido; });
        // Domicilio → queda 'Listo' para que el repartidor lo recoja
        // Local / mostrador → pasa directo a 'Entregado' (no hay repartidor)
        var esDomicilio = pedido && pedido.tipoEntrega === 'domicilio';
        var estadoFinal = esDomicilio ? 'Listo' : 'Entregado';
        await fetch(API_BASE + '/pedidos/' + idPedido + '/estado', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: estadoFinal })  // Sin idEmpleado: el cajero ya está asignado
        });
        await cargarPedidosCocina();
    } catch (e) { alert('Error al actualizar el pedido.'); }
}

function cerrarSesionEmpleado() {
    if (!confirm('¿Cerrar sesión?')) return;
    localStorage.removeItem('empleadoHawaiiana');
    window.location.href = 'empleado.html';
}
