var _promosCache    = [];   // Promociones vigentes para POS
var _productoMapPOS = {};   // idProducto → precio para calcular descuento

// pos.js — Punto de venta
var API_BASE = '/api';

var _empleado         = null;
var catalogoGrupos    = [];
var carritoPos        = [];
var grupoSeleccionado = null;
var varSeleccionada   = null;
var categoriaActual   = 'todas';
var estadoCaja        = { abierta: true, montoInicial: 500.00 };

var ICONOS_POS = {
    pizza:'bi-circle-fill', preferida:'bi-heart-fill', deluxe:'bi-gem',
    bebida:'bi-cup-straw', entrada:'bi-egg-fried', snack:'bi-bag-fill',
    extra:'bi-plus-circle-fill', postre:'bi-cake2-fill'
};

document.addEventListener('DOMContentLoaded', function () {
    var cliente = JSON.parse(localStorage.getItem('clienteHawaiiana') || 'null');
    _empleado   = JSON.parse(localStorage.getItem('empleadoHawaiiana') || 'null');

    if (!_empleado) {
        if (cliente) mostrarErrorAcceso('Esta área es exclusiva para el personal de caja.', '../cliente/index.html');
        else window.location.href = 'empleado.html';
        return;
    }

    var esAdmin = (_empleado.cargo === 'Gerente' || _empleado.cargo === 'Administrador');
    if (esAdmin) {
        _inyectarBotonModulos();
    }

    cargarProductosPOS();
    actualizarResumen();
    configurarEventos();
    estadoCaja.montoInicial = 0;  // Empieza en 0; cajero lo ajusta si abre con efectivo
    mostrarEstadoCaja();
    actualizarVentasDia();
    setInterval(actualizarVentasDia, 30000); // Actualizar ventas cada 30 s
});

function _inyectarBotonModulos() {
    var navDesktop = document.querySelector('.d-none.d-lg-flex');
    if (navDesktop && !document.getElementById('btn-volver-modulos')) {
        var btn = document.createElement('a');
        btn.id = 'btn-volver-modulos'; btn.href = 'inicio.html';
        btn.className = 'btn btn-sm btn-outline-warning';
        btn.innerHTML = '<i class="bi bi-grid-3x3-gap-fill"></i> Módulos';
        var btnTema = navDesktop.querySelector('#btn-tema');
        if (btnTema) navDesktop.insertBefore(btn, btnTema);
        else navDesktop.insertBefore(btn, navDesktop.firstChild);
    }
    var offcanvasBody = document.querySelector('.offcanvas-body');
    if (offcanvasBody && !document.getElementById('link-modulos-movil')) {
        var link = document.createElement('a');
        link.id = 'link-modulos-movil'; link.href = 'inicio.html';
        link.className = 'menu-item-movil';
        link.innerHTML = '<i class="bi bi-grid-3x3-gap-fill icono-menu"></i> Volver a Módulos';
        offcanvasBody.insertBefore(link, offcanvasBody.firstChild);
    }
}

async function cargarProductosPOS() {
    var cont = document.getElementById('grid-productos-pos');
    if (cont) cont.innerHTML = '<p class="texto-secundario text-center py-4">Cargando...</p>';
    try {
        const res  = await fetch(`${API_BASE}/productos?todos=true`, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const activos = data.filter(function (p) { return p.activo; });
        var mapa = {};
        activos.forEach(function (p) {
            var catLow = (p.categoria || '').toLowerCase();
            if (!mapa[p.nombre]) mapa[p.nombre] = { nombre: p.nombre, categoria: catLow, descripcion: p.descripcion || '', precioBase: p.precio, variaciones: [] };
            if (p.precio < mapa[p.nombre].precioBase) mapa[p.nombre].precioBase = p.precio;
            mapa[p.nombre].variaciones.push({ id: p.idProducto, tamanio: p.tamanio || 'Único', precio: p.precio });
            _productoMapPOS[p.idProducto] = { nombre: p.nombre, precio: p.precio, tamanio: p.tamanio || 'Único' };
        });
        catalogoGrupos = Object.values(mapa);
        renderizarProductos(catalogoGrupos);
        // Cargar promos en caché para el filtro de POS
        try {
            var resP = await fetch(API_BASE + '/promociones?vigentes=true');
            var todasPromos = await resP.json();
            // Solo mostrador o ambos (el POS es para ventas en local)
            _promosCache = todasPromos.filter(function(p) {
                return p.condiciones === 'Mostrador' || p.condiciones === 'Ambos' || !p.condiciones;
            });
        } catch (e) { _promosCache = []; }
    } catch (err) {
        if (cont) cont.innerHTML = '<p class="texto-secundario text-danger text-center py-4">Error al cargar productos.</p>';
    }
}

function renderizarProductos(lista) {
    var cont = document.getElementById('grid-productos-pos');
    if (!cont) return;
    cont.innerHTML = '';
    if (!lista.length) { cont.innerHTML = '<p class="texto-secundario">Sin productos.</p>'; return; }
    lista.forEach(function (grp) {
        var iconoCls = ICONOS_POS[grp.categoria] || 'bi-box-fill';
        var textoPrecio = grp.variaciones.length > 1 ? 'Desde $' + grp.precioBase : '$' + grp.precioBase;
        var col = document.createElement('div');
        col.className = 'col-6 col-md-4 col-lg-3';
        col.innerHTML = '<button class="btn-producto w-100" onclick="abrirModalProducto(\'' + grp.nombre.replace(/'/g, "\\'") + '\')">' +
            '<i class="bi ' + iconoCls + '" style="font-size:1.3em;"></i>' +
            '<strong style="font-size:0.85em;line-height:1.2;display:block;margin-top:4px;">' + grp.nombre + '</strong>' +
            '<span class="precio-destacado" style="font-size:0.9em;">' + textoPrecio + '</span></button>';
        cont.appendChild(col);
    });
}

function filtrarCategoriaPos(categoria, btnEl) {
    categoriaActual = categoria;
    document.querySelectorAll('#filtros-pos .btn').forEach(function (b) { b.classList.remove('active'); });
    if (btnEl) { btnEl.classList.add('active'); }

    // Filtro especial: Promociones
    if (categoria === 'promo') {
        renderPromocionesEnPOS();
        return;
    }

    var resultado = categoria === 'todas' ? catalogoGrupos : catalogoGrupos.filter(function (g) {
        if (categoria === 'pizza') return g.categoria === 'pizza' || g.categoria === 'preferida' || g.categoria === 'deluxe';
        return g.categoria === categoria;
    });
    renderizarProductos(resultado);
}

function renderPromocionesEnPOS() {
    var cont = document.getElementById('grid-productos-pos');
    if (!cont) return;
    cont.innerHTML = '';

    if (!_promosCache.length) {
        cont.innerHTML = '<div class="col-12"><div class="alert alert-info"><i class="bi bi-tag"></i> No hay promociones vigentes para mostrador.</div></div>';
        return;
    }

    // Agrupar por nombre de campaña
    var grupos = {};
    _promosCache.forEach(function(pr) {
        if (!grupos[pr.nombre]) {
            grupos[pr.nombre] = { nombre: pr.nombre, porcentajeDes: pr.porcentajeDes, condiciones: pr.condiciones, productos: [] };
        }
        var prod = _productoMapPOS[pr.idProducto];
        if (prod) {
            var precioDesc = Math.round(prod.precio * (1 - pr.porcentajeDes / 100) * 100) / 100;
            grupos[pr.nombre].productos.push({
                id: pr.idProducto, nombre: prod.nombre,
                tamanio: prod.tamanio, precioOrig: prod.precio, precioDesc: precioDesc
            });
        }
    });

    Object.values(grupos).forEach(function(grp) {
        if (!grp.productos.length) return;
        var totalPack = grp.productos.reduce(function(a, p) { return a + p.precioDesc; }, 0);

        var listaHTML = grp.productos.map(function(p) {
            var tam = (p.tamanio && p.tamanio !== 'Único') ? ' (' + p.tamanio + ')' : '';
            return '<div class="d-flex justify-content-between align-items-center py-1 border-bottom" style="font-size:.82em;">' +
                '<span><i class="bi bi-check-circle-fill text-success me-1"></i>' + p.nombre + tam + '</span>' +
                '<span><small class="text-decoration-line-through text-secondary me-1">$' + p.precioOrig + '</small>' +
                '<strong class="texto-acento">$' + p.precioDesc.toFixed(2) + '</strong></span>' +
                '</div>';
        }).join('');

        var idGrp = 'posgrp' + Object.keys(grupos).indexOf(grp.nombre);
        _posPromoGrupos[idGrp] = grp.productos;
        var col = document.createElement('div');
        col.className = 'col-md-6 col-lg-4';
        col.innerHTML =
            '<div class="tarjeta-tema p-3 h-100 d-flex flex-column" style="border-top:3px solid var(--color-acento);">' +
            '<div class="d-flex justify-content-between align-items-start mb-2">' +
            '<h6 class="texto-principal fw-bold mb-0"><i class="bi bi-tag-fill texto-acento me-1"></i>' + grp.nombre + '</h6>' +
            '<span class="badge bg-danger">-' + grp.porcentajeDes + '%</span>' +
            '</div>' +
            '<div class="flex-grow-1 mb-2">' + listaHTML + '</div>' +
            '<div class="d-flex justify-content-between align-items-center mt-2 pt-2 border-top">' +
            '<small class="texto-secundario">Pack total: <strong>$' + totalPack.toFixed(2) + '</strong></small>' +
            '<button class="btn btn-sm btn-rojo" onclick="agregarPackPromoPos(\''   + idGrp + '\')">' +
            '<i class="bi bi-bag-plus-fill"></i> Agregar Pack</button>' +
            '</div></div>';
        cont.appendChild(col);
    });
}

var _posPromoGrupos = {};   // mapa idGrp → array de productos

function agregarPackPromoPos(idGrp) {
    var productos = _posPromoGrupos[idGrp] || [];
    productos.forEach(function(p) {
        var tam     = (p.tamanio && p.tamanio !== 'Único') ? ' (' + p.tamanio + ')' : '';
        var nombre  = p.nombre + tam + ' 🏷️';
        var existente = carritoPos.find(function(i) { return i.id === p.id && i.nombre === nombre; });
        if (existente) existente.cantidad += 1;
        else carritoPos.push({ id: p.id, nombre: nombre, precio: p.precioDesc, cantidad: 1, observaciones: null });
    });
    actualizarResumen();
    mostrarNotificacion('Pack de promoción agregado ✓', 'success');
}

function abrirModalProducto(nombreGrupo) {
    grupoSeleccionado = catalogoGrupos.find(function (g) { return g.nombre === nombreGrupo; });
    if (!grupoSeleccionado) return;
    var titulo = document.getElementById('nombreProductoModal');
    if (titulo) titulo.textContent = grupoSeleccionado.nombre;
    var secTam = document.getElementById('sec-tamano-pos');
    if (secTam) {
        if (grupoSeleccionado.variaciones.length > 1) {
            var botonesHTML = grupoSeleccionado.variaciones.map(function (v, i) {
                return '<button type="button" class="btn btn-outline-secondary btn-sm' + (i === 0 ? ' active' : '') + '"' +
                    ' onclick="seleccionarVariacion(this,\'' + v.id + '\',' + v.precio + ',\'' + v.tamanio + '\')">' +
                    v.tamanio + ' — $' + v.precio + '</button>';
            }).join('');
            secTam.innerHTML = '<label class="form-label texto-principal">Tamaño:</label>' +
                '<div class="d-flex flex-wrap gap-1 mb-2">' + botonesHTML + '</div>';
            secTam.style.display = 'block';
        } else {
            secTam.style.display = 'none';
        }
    }
    var v0 = grupoSeleccionado.variaciones[0];
    varSeleccionada = { id: v0.id, precio: v0.precio, tamanio: v0.tamanio };
    document.getElementById('cantidadInput').value      = 1;
    document.getElementById('observacionesInput').value = '';
    new bootstrap.Modal(document.getElementById('modalCantidad')).show();
}

function seleccionarVariacion(btn, id, precio, tamanio) {
    varSeleccionada = { id: id, precio: precio, tamanio: tamanio };
    var wrap = btn.closest('.d-flex');
    if (wrap) wrap.querySelectorAll('.btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
}

function agregarAlPOS() {
    if (!grupoSeleccionado || !varSeleccionada) return;
    var cantidad      = parseInt(document.getElementById('cantidadInput').value) || 1;
    var observaciones = (document.getElementById('observacionesInput').value || '').trim() || null;
    var nombreMostrar = grupoSeleccionado.nombre + (varSeleccionada.tamanio !== 'Único' ? ' (' + varSeleccionada.tamanio + ')' : '');
    var existente = carritoPos.find(function (item) { return item.id === varSeleccionada.id && item.observaciones === observaciones; });
    if (existente) existente.cantidad += cantidad;
    else carritoPos.push({ id: varSeleccionada.id, nombre: nombreMostrar, precio: varSeleccionada.precio, cantidad: cantidad, observaciones: observaciones && observaciones.trim() ? observaciones.trim() : null });
    actualizarResumen();
    bootstrap.Modal.getInstance(document.getElementById('modalCantidad')).hide();
}

function actualizarResumen() {
    var cont = document.getElementById('detalles-venta');
    if (!cont) return;
    if (!carritoPos.length) {
        cont.innerHTML = '<p class="texto-secundario text-center" style="padding:20px;">Sin productos</p>';
    } else {
        cont.innerHTML = '';
        carritoPos.forEach(function (item, idx) {
            var sub  = item.precio * item.cantidad;
            var fila = document.createElement('div');
            fila.className = 'd-flex justify-content-between align-items-start mb-2 border-bottom pb-2';
            fila.innerHTML = '<div style="flex:1;"><span class="texto-principal" style="font-size:.9em;"><strong>' + item.cantidad + 'x</strong> ' + item.nombre + '</span>' +
                (item.observaciones ? '<br><small class="texto-secundario">' + item.observaciones + '</small>' : '') + '</div>' +
                '<div class="d-flex align-items-center gap-2"><span class="precio-destacado" style="font-size:.9em;">$' + sub.toFixed(2) + '</span>' +
                '<button class="btn btn-sm btn-outline-danger" onclick="quitarDelCarrito(' + idx + ')"><i class="bi bi-x-lg"></i></button></div>';
            cont.appendChild(fila);
        });
    }
    var total = carritoPos.reduce(function (acc, i) { return acc + i.precio * i.cantidad; }, 0);
    document.getElementById('pos-subtotal').textContent = '$' + total.toFixed(2);
    document.getElementById('pos-total').textContent    = '$' + total.toFixed(2);
}

function quitarDelCarrito(idx) { carritoPos.splice(idx, 1); actualizarResumen(); }

async function procesarCobro() {
    if (!carritoPos.length) { alert('Agrega al menos un producto antes de cobrar.'); return; }
    var selectMetodo = document.getElementById('pos-metodo-pago');
    var metodoPago   = selectMetodo ? selectMetodo.value : 'efectivo';
    var btnCobrar    = document.getElementById('btn-cobrar');
    var textoOrig    = btnCobrar ? btnCobrar.innerHTML : 'Cobrar';
    if (btnCobrar) { btnCobrar.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Procesando...'; btnCobrar.disabled = true; }
    try {
        var idCajero = (_empleado && (_empleado.idEmpleado || _empleado.IdEmpleado))
            ? (_empleado.idEmpleado || _empleado.IdEmpleado) : 'E001';
        var payload = {
            idCliente: 'C000', IdCliente: 'C000',
            idEmpleado: idCajero, IdEmpleado: idCajero,
            tipoEntrega: 'local', metodoPago: metodoPago,
            detalles: carritoPos.map(function (item) {
                return { idProducto: item.id, cantidad: item.cantidad, precioUnitario: item.precio, observaciones: (item.observaciones && typeof item.observaciones === 'string' && item.observaciones.trim()) ? item.observaciones.trim() : null };
            })
        };
        const res = await fetch(`${API_BASE}/pedidos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) {
            var errorMensaje = 'Error al registrar.';
            try { const errData = await res.json(); errorMensaje = errData.mensaje || errData.title || errorMensaje; } catch (e) {}
            alert('No se pudo registrar la venta: ' + errorMensaje);
            return;
        }
        const data = await res.json();
        // Marcar como Entregado de inmediato (venta en mostrador)
        await fetch(`${API_BASE}/pedidos/${data.idPedido}/estado`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'En cocina', idEmpleado: idCajero })  // Cocina lo marcará Entregado al terminar
        });
        var conf    = document.getElementById('confirmacion-pago');
        var detText = document.getElementById('detalles-pago');
        var metNom  = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
        if (conf && detText) {
            detText.innerHTML = '<strong>Total cobrado:</strong> $' + (data.total || 0).toFixed(2) +
                '<br><strong>Método:</strong> ' + (metNom[metodoPago] || metodoPago) +
                '<br><strong>Ticket:</strong> ' + data.idPedido;
            conf.style.display = 'block';
        }
        carritoPos = [];
        actualizarResumen();
    } catch (err) {
        alert('Error de conexión con el servidor.');
    } finally {
        if (btnCobrar) { btnCobrar.innerHTML = textoOrig; btnCobrar.disabled = false; }
    }
}

function cancelarVenta() {
    if (carritoPos.length > 0 && !confirm('¿Cancelar la venta?')) return;
    carritoPos = [];
    actualizarResumen();
    var conf = document.getElementById('confirmacion-pago');
    if (conf) conf.style.display = 'none';
}


// ── Ventas del día en tiempo real ────────────────────────────────────────────

async function actualizarVentasDia() {
    try {
        var hoyISO = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        var res    = await fetch(API_BASE + '/pedidos?estado=Entregado', { headers: { Accept: 'application/json' } });
        var todos  = await res.json();
        // Filtrar solo los de hoy (p.fecha viene como dd/MM/yyyy)
        var hoy = todos.filter(function (p) {
            if (!p.fecha) return false;
            var partes = p.fecha.split('/');
            if (partes.length !== 3) return false;
            return partes[2] + '-' + partes[1] + '-' + partes[0] === hoyISO;
        });
        var total = hoy.reduce(function (acc, p) { return acc + Number(p.total); }, 0);
        var el = document.getElementById('ventas-dia-pos');
        if (el) el.textContent = '$' + total.toFixed(2);
        return total;
    } catch (e) { return 0; }
}

function mostrarEstadoCaja() {
    var estEl   = document.getElementById('estado-caja');
    var montoEl = document.getElementById('monto-inicial');
    if (estEl)   { estEl.textContent = 'Abierta'; estEl.className = 'badge bg-success ms-1'; }
    if (montoEl) montoEl.textContent = estadoCaja.montoInicial.toFixed(2);
}

function editarMontoInicial() {
    var actual = parseFloat(document.getElementById('monto-inicial')?.textContent || '500');
    var nuevo  = prompt('Ingresa el monto de apertura de caja:', actual);
    if (nuevo === null) return;
    var monto = parseFloat(nuevo);
    if (isNaN(monto) || monto < 0) { alert('Monto inválido.'); return; }
    var el = document.getElementById('monto-inicial');
    if (el) el.textContent = monto.toFixed(2);
    estadoCaja.montoInicial = monto;
}

async function cerrarCaja() {
    var total = await actualizarVentasDia();
    var montoApertura = estadoCaja.montoInicial || 0;
    var resumen = '¿Confirmar cierre de caja?\n\n' +
        'Monto de apertura: $' + montoApertura.toFixed(2) + '\n' +
        'Ventas del día:    $' + total.toFixed(2) + '\n' +
        'Total en caja:     $' + (montoApertura + total).toFixed(2);
    if (confirm(resumen)) {
        var estEl = document.getElementById('estado-caja');
        if (estEl) { estEl.textContent = 'Cerrada'; estEl.className = 'badge bg-danger ms-1'; }
        var btn = document.getElementById('btn-cerrar-caja');
        if (btn) btn.disabled = true;
        var el = document.getElementById('ventas-dia-pos');
        if (el) el.textContent = '$' + total.toFixed(2);
        notif('Caja cerrada. Total del día: $' + total.toFixed(2), 'success', 6000);
    }
}

function configurarEventos() {
    var btnCobrar   = document.getElementById('btn-cobrar');
    var btnCancelar = document.getElementById('btn-cancelar-venta');
    var btnCerrar   = document.getElementById('btn-cerrar-caja');
    if (btnCobrar)   btnCobrar.addEventListener('click', procesarCobro);
    if (btnCancelar) btnCancelar.addEventListener('click', cancelarVenta);
    if (btnCerrar)   btnCerrar.addEventListener('click', cerrarCaja);
}

// ── Pedidos Web ───────────────────────────────────────────────────────────────

async function cargarPedidosWebPOS() {
    var tbody  = document.getElementById('tabla-pedidos-pos');
    if (!tbody) return;

    // Mostrar modal solo si no está ya abierto (evita el doble backdrop)
    var modalEl = document.getElementById('modalPedidosWeb');
    var instancia = bootstrap.Modal.getInstance(modalEl);
    if (!instancia) new bootstrap.Modal(modalEl).show();

    await _refrescarTablaPedidosWeb();
}

// Refresca el contenido de la tabla SIN recrear el modal (evita el modal oscuro)
async function _refrescarTablaPedidosWeb() {
    var tbody = document.getElementById('tabla-pedidos-pos');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="text-center texto-secundario"><span class="spinner-border spinner-border-sm me-2"></span>Actualizando...</td></tr>';

    try {
        const res      = await fetch(`${API_BASE}/pedidos`, { headers: { Accept: 'application/json' } });
        const pedidos  = await res.json();
        const pendientes = pedidos.filter(function (p) { return p.estado === 'Preparando'; });

        if (!pendientes.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center texto-secundario">No hay pedidos web pendientes.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        pendientes.forEach(function (p) {
            var tipoIcono = p.tipoEntrega === 'domicilio'
                ? '<i class="bi bi-scooter"></i> Domicilio'
                : '<i class="bi bi-shop"></i> Mostrador';
            var tr = document.createElement('tr');
            tr.innerHTML = '<td class="fw-bold texto-principal">' + p.idPedido + '</td>' +
                '<td class="texto-secundario">' + tipoIcono + '</td>' +
                '<td class="precio-destacado">$' + p.total.toFixed(2) + '</td>' +
                '<td><button class="btn btn-sm btn-success" onclick="aceptarPedidoWebPOS(\'' + p.idPedido + '\')">' +
                '<i class="bi bi-check-circle"></i> Aceptar</button></td>';
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-danger text-center">Error al cargar pedidos.</td></tr>';
    }
}

async function aceptarPedidoWebPOS(idPedido) {
    try {
        // Guardar el cajero que aceptó el pedido web
        var idCajero = (_empleado && (_empleado.idEmpleado || _empleado.IdEmpleado))
            ? (_empleado.idEmpleado || _empleado.IdEmpleado) : null;

        const res = await fetch(`${API_BASE}/pedidos/${idPedido}/estado`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'En cocina', idEmpleado: idCajero })
        });
        if (res.ok) {
            mostrarNotificacion('Pedido <strong>' + idPedido + '</strong> enviado a cocina 🍕', 'success');
            // Solo refrescar la tabla, NO recrear el modal
            await _refrescarTablaPedidosWeb();
        } else {
            alert('Error al aceptar el pedido.');
        }
    } catch (err) {
        alert('Error de conexión.');
    }
}
