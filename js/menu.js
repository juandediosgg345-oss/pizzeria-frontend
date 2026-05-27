// menu.js — Catálogo con paginación y fichas de pack para promociones
var API_BASE = 'http://pizzhawaiiana-001-site1.qtempurl.com/api';

// Catálogo
var pizzas           = [];
var _productoMap     = {};   // idProducto → { nombre, precio, tamanio, categoriaAPI }
var _idsEnPromo      = [];
var _promoGrupos     = {};   // Agrupados por nombre de campaña

// Estado UI
var filtroActivo          = 'todas';
var textoBusqueda         = '';
var _listaFiltrada        = [];
var _paginaActual         = 1;
var _porPagina            = 12;

// Modal
var productoSeleccionado  = null;
var variacionSeleccionada = null;

var ICONOS_CAT = {
    pizza:'bi-circle-fill', preferida:'bi-heart-fill', deluxe:'bi-gem',
    bebida:'bi-cup-straw', entrada:'bi-egg-fried', snack:'bi-bag-fill', extra:'bi-plus-circle-fill'
};

// ── Carga del catálogo ────────────────────────────────────────────────────────

async function cargarCatalogoDesdeAPI() {
    var cont = document.getElementById('contenedor-pizzas');
    if (cont) cont.innerHTML =
        '<div class="col-12 text-center py-5">' +
        '<div class="spinner-border text-danger"></div>' +
        '<p class="texto-secundario mt-2">Cargando menú...</p></div>';

    try {
        var res = await fetch(API_BASE + '/productos', { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var productosAPI = await res.json();

        var mapaAgrupado = {};
        _productoMap     = {};

        productosAPI.forEach(function (p) {
            var cat = (p.categoria || '').toLowerCase();
            _productoMap[p.idProducto] = { nombre: p.nombre, precio: p.precio, tamanio: p.tamanio || 'Único', categoriaAPI: cat };
            if (!mapaAgrupado[p.nombre]) {
                mapaAgrupado[p.nombre] = { nombre: p.nombre, ingredientes: p.descripcion || '', categoriaAPI: cat, precioBase: p.precio, variaciones: [] };
            }
            if (p.precio < mapaAgrupado[p.nombre].precioBase) mapaAgrupado[p.nombre].precioBase = p.precio;
            mapaAgrupado[p.nombre].variaciones.push({ id: p.idProducto, tamanio: p.tamanio || 'Único', precio: p.precio });
        });

        pizzas = Object.values(mapaAgrupado);

        // Cargar promociones vigentes
        try {
            var resP = await fetch(API_BASE + '/promociones?vigentes=true');
            var promos = await resP.json();
            // Menú cliente: solo promos de Domicilio o Ambos (Mostrador es solo para POS)
            var promosFiltradas = promos.filter(function (pr) {
                return !pr.condiciones || pr.condiciones !== 'Mostrador';
            });
            _idsEnPromo = promosFiltradas.map(function (pr) { return pr.idProducto; });
            _promoGrupos = {};
            promosFiltradas.forEach(function (pr) {
                if (!_promoGrupos[pr.nombre]) {
                    _promoGrupos[pr.nombre] = { nombre: pr.nombre, porcentajeDes: pr.porcentajeDes, fechaInicio: pr.fechaInicio, fechaFin: pr.fechaFin, idProductos: [] };
                }
                if (_promoGrupos[pr.nombre].idProductos.indexOf(pr.idProducto) === -1)
                    _promoGrupos[pr.nombre].idProductos.push(pr.idProducto);
            });
        } catch (e) { _idsEnPromo = []; _promoGrupos = {}; }

        aplicarFiltros();
    } catch (err) {
        console.error(err);
        if (cont) cont.innerHTML =
            '<div class="col-12"><div class="alert alert-danger">' +
            '<i class="bi bi-exclamation-triangle-fill"></i> No se pudo cargar el menú. ' +
            'Verifica que el servidor esté corriendo.</div></div>';
    }
}

// ── Filtrado ──────────────────────────────────────────────────────────────────

function aplicarFiltros() {
    if (filtroActivo === 'promo') {
        mostrarPromociones(textoBusqueda);
        return;
    }

    var termino = textoBusqueda.toLowerCase().trim();

    var reglas = {
        'todas':     function () { return true; },
        'preferida': function (p) { return p.categoriaAPI === 'preferida'; },
        'deluxe':    function (p) { return p.categoriaAPI === 'deluxe'; },
        'snack':     function (p) { return p.categoriaAPI === 'snack'; },
        'alita':     function (p) { return p.categoriaAPI === 'entrada'; },
        'extra':     function (p) { return p.categoriaAPI === 'extra'; },
        'refresco':  function (p) { return p.categoriaAPI === 'bebida'; }
    };

    var regla = reglas[filtroActivo] || reglas['todas'];
    _listaFiltrada = pizzas.filter(function (p) {
        return regla(p) && (termino === '' || p.nombre.toLowerCase().includes(termino) || p.ingredientes.toLowerCase().includes(termino));
    });

    _paginaActual = 1;
    renderPaginaProductos();
}

function filtrar(categoria) {
    filtroActivo  = categoria;
    _paginaActual = 1;
    document.querySelectorAll('.btn-filtro-cat').forEach(function (b) {
        b.classList.toggle('activo', b.dataset.filtro === categoria);
    });
    var sel = document.getElementById('select-filtro-cat');
    if (sel) sel.value = categoria;
    aplicarFiltros();
}

function limpiarFiltros() {
    filtroActivo  = 'todas';
    textoBusqueda = '';
    _paginaActual = 1;
    var buscador = document.getElementById('buscador-menu');
    if (buscador) buscador.value = '';
    document.querySelectorAll('.btn-filtro-cat').forEach(function (b) {
        b.classList.toggle('activo', b.dataset.filtro === 'todas');
    });
    var sel = document.getElementById('select-filtro-cat');
    if (sel) sel.value = 'todas';
    aplicarFiltros();
}

// ── Render del grid con paginación ────────────────────────────────────────────

function renderPaginaProductos() {
    var cont          = document.getElementById('contenedor-pizzas');
    var sinResultados = document.getElementById('sin-resultados');
    var navCont       = document.getElementById('paginacion-menu');
    if (!cont) return;

    if (!_listaFiltrada.length) {
        cont.innerHTML = '';
        if (sinResultados) sinResultados.style.display = 'block';
        if (navCont) navCont.innerHTML = '';
        return;
    }
    if (sinResultados) sinResultados.style.display = 'none';

    var totalPags = Math.ceil(_listaFiltrada.length / _porPagina);
    if (_paginaActual < 1) _paginaActual = 1;
    if (_paginaActual > totalPags) _paginaActual = totalPags;

    var desde   = (_paginaActual - 1) * _porPagina;
    var pagina  = _listaFiltrada.slice(desde, desde + _porPagina);

    cont.innerHTML = '';

    pagina.forEach(function (p) {
        var multiTam = p.variaciones.length > 1;
        var iconoCls = ICONOS_CAT[p.categoriaAPI] || 'bi-grid-fill';

        var badge = '';
        if (p.categoriaAPI === 'deluxe')   badge = '<span class="badge bg-warning text-dark ms-1" style="font-size:.68em;">Deluxe</span>';
        if (p.categoriaAPI === 'preferida') badge = '<span class="badge bg-success ms-1" style="font-size:.68em;">Preferida</span>';
        var enPromo = p.variaciones.some(function (v) { return _idsEnPromo.indexOf(v.id) !== -1; });
        if (enPromo) badge += '<span class="badge bg-danger ms-1" style="font-size:.65em;"><i class="bi bi-tag-fill"></i> Promo</span>';

        var textoPrecio = multiTam
            ? '<small style="font-size:.75em;">Desde </small>$' + p.precioBase
            : '$' + p.precioBase;

        var nombreSeguro = p.nombre.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        var btnAccion    = 'onclick="abrirModal(\'' + nombreSeguro + '\')"';

        cont.innerHTML +=
            '<div class="col-sm-6 col-lg-4 col-xl-3 mb-3">' +
            '<div class="tarjeta-pizza d-flex flex-column h-100">' +
            '<div style="font-size:2.8rem;text-align:center;margin-bottom:6px;">' +
            '<i class="bi ' + iconoCls + ' texto-acento"></i></div>' +
            '<h5 class="mb-1">' + p.nombre + badge + '</h5>' +
            '<p class="flex-grow-1 mb-2" style="font-size:.9em;color:var(--text-muted);">' + p.ingredientes + '</p>' +
            '<div class="d-flex align-items-center justify-content-between mt-auto">' +
            '<span class="precio">' + textoPrecio + '</span>' +
            '<button class="btn btn-rojo btn-sm" ' + btnAccion + '>Pedir</button>' +
            '</div></div></div>';
    });

    // Paginación Bootstrap centrada
    if (navCont) {
        if (totalPags <= 1) {
            navCont.innerHTML = '';
        } else {
            var items = '';

            // Anterior
            items += '<li class="page-item' + (_paginaActual === 1 ? ' disabled' : '') + '">' +
                '<button class="page-link" ' + (_paginaActual > 1 ? 'onclick="irPaginaMenu(' + (_paginaActual - 1) + ')"' : '') + '>‹ Anterior</button></li>';

            // Números (máx 5 visibles)
            var ini = Math.max(1, _paginaActual - 2);
            var fin = Math.min(totalPags, ini + 4);
            if (fin - ini < 4) ini = Math.max(1, fin - 4);

            if (ini > 1) {
                items += '<li class="page-item"><button class="page-link" onclick="irPaginaMenu(1)">1</button></li>';
                if (ini > 2) items += '<li class="page-item disabled"><span class="page-link">…</span></li>';
            }
            for (var i = ini; i <= fin; i++) {
                items += '<li class="page-item' + (i === _paginaActual ? ' active' : '') + '">' +
                    '<button class="page-link" onclick="irPaginaMenu(' + i + ')">' + i + '</button></li>';
            }
            if (fin < totalPags) {
                if (fin < totalPags - 1) items += '<li class="page-item disabled"><span class="page-link">…</span></li>';
                items += '<li class="page-item"><button class="page-link" onclick="irPaginaMenu(' + totalPags + ')">' + totalPags + '</button></li>';
            }

            // Siguiente
            items += '<li class="page-item' + (_paginaActual === totalPags ? ' disabled' : '') + '">' +
                '<button class="page-link" ' + (_paginaActual < totalPags ? 'onclick="irPaginaMenu(' + (_paginaActual + 1) + ')"' : '') + '>Siguiente ›</button></li>';

            navCont.innerHTML =
                '<div class="text-center mb-2">' +
                '<small class="texto-secundario">' + _listaFiltrada.length + ' productos &nbsp;·&nbsp; Página ' + _paginaActual + ' de ' + totalPags + '</small>' +
                '</div>' +
                '<nav><ul class="pagination justify-content-center">' + items + '</ul></nav>';
        }
    }
}

function irPaginaMenu(n) {
    _paginaActual = n;
    renderPaginaProductos();
    // Scroll suave al inicio del grid
    var cont = document.getElementById('contenedor-pizzas');
    if (cont) cont.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Fichas de Promoción (pack completo) ───────────────────────────────────────

function mostrarPromociones(termino) {
    var cont          = document.getElementById('contenedor-pizzas');
    var sinResultados = document.getElementById('sin-resultados');
    var navCont       = document.getElementById('paginacion-menu');
    if (!cont) return;
    if (navCont) navCont.innerHTML = '';

    var grupos = Object.values(_promoGrupos);

    if (termino) {
        var t = termino.toLowerCase();
        grupos = grupos.filter(function (g) {
            return g.nombre.toLowerCase().includes(t) ||
                g.idProductos.some(function (id) { return _productoMap[id] && _productoMap[id].nombre.toLowerCase().includes(t); });
        });
    }

    if (!grupos.length) {
        cont.innerHTML = '';
        if (sinResultados) sinResultados.style.display = 'block';
        return;
    }
    if (sinResultados) sinResultados.style.display = 'none';
    cont.innerHTML = '';

    grupos.forEach(function (grp, gi) {
        var grupoId = 'grp' + gi;
        var prodsConPrecio = [];
        grp.idProductos.forEach(function (idProd) {
            var prod = _productoMap[idProd];
            if (!prod) return;
            var desc = Math.round(prod.precio * (1 - grp.porcentajeDes / 100) * 100) / 100;
            prodsConPrecio.push({ id: idProd, nombre: prod.nombre, tamanio: prod.tamanio, precioOrig: prod.precio, precioDesc: desc });
        });
        if (!prodsConPrecio.length) return;

        var totalPack = prodsConPrecio.reduce(function (a, p) { return a + p.precioDesc; }, 0);

        var listaHTML = prodsConPrecio.map(function (p) {
            var tam = (p.tamanio && p.tamanio !== 'Único') ? ' <small class="texto-secundario">(' + p.tamanio + ')</small>' : '';
            return '<div class="d-flex justify-content-between align-items-center py-2 border-bottom">' +
                '<div class="d-flex align-items-center gap-2">' +
                '<i class="bi bi-check-circle-fill" style="color:var(--color-acento);font-size:.85em;flex-shrink:0;"></i>' +
                '<span class="texto-principal">' + p.nombre + tam + '</span>' +
                '</div>' +
                '<div class="text-end flex-shrink-0 ms-2">' +
                '<small class="texto-secundario text-decoration-line-through">$' + p.precioOrig + '</small> ' +
                '<span class="precio-destacado">$' + p.precioDesc.toFixed(2) + '</span>' +
                '</div></div>';
        }).join('');

        var nombreSeguro = grp.nombre.replace(/\\/g,'\\\\').replace(/'/g,"\\'");

        var col = document.createElement('div');
        col.className = 'col-md-6 col-lg-4 mb-4';
        col.innerHTML =
            '<div class="tarjeta-pizza d-flex flex-column h-100" style="border:2px solid var(--color-acento);">' +
            '<div class="d-flex justify-content-between align-items-start mb-1">' +
            '<h5 class="mb-0 texto-principal"><i class="bi bi-tag-fill texto-acento me-1"></i>' + grp.nombre + '</h5>' +
            '<span class="badge bg-danger ms-1" style="font-size:.9em;">-' + grp.porcentajeDes + '%</span>' +
            '</div>' +
            '<small class="texto-secundario mb-3">Válido del ' + grp.fechaInicio + ' al ' + grp.fechaFin + '</small>' +
            '<div class="flex-grow-1 mb-2">' + listaHTML + '</div>' +
            '<div class="d-flex justify-content-between align-items-center py-2 mb-2 border-top">' +
            '<span class="texto-secundario small fw-bold">Total del pack:</span>' +
            '<span class="precio-destacado fw-bold">$' + totalPack.toFixed(2) + '</span>' +
            '</div>' +
            '<div class="d-flex align-items-center justify-content-between mt-auto">' +
            '<div class="d-flex align-items-center gap-1">' +
            '<button type="button" class="btn btn-sm btn-outline-secondary px-2" onclick="cambiarCantPromo(\'' + grupoId + '\',-1)">−</button>' +
            '<input type="number" id="cant-promo-' + grupoId + '" class="form-control form-control-sm text-center" value="1" min="1" style="width:52px;">' +
            '<button type="button" class="btn btn-sm btn-outline-secondary px-2" onclick="cambiarCantPromo(\'' + grupoId + '\',1)">+</button>' +
            '</div>' +
            '<button class="btn btn-rojo btn-sm" onclick="agregarPromoAlCarrito(\'' + grupoId + '\',\'' + nombreSeguro + '\',' + grp.porcentajeDes + ')">' +
            '<i class="bi bi-bag-plus-fill"></i> Pedir Pack</button>' +
            '</div></div>';
        cont.appendChild(col);
    });
}

function cambiarCantPromo(grupoId, delta) {
    var input = document.getElementById('cant-promo-' + grupoId);
    if (!input) return;
    input.value = Math.max(1, (parseInt(input.value) || 1) + delta);
}

function agregarPromoAlCarrito(grupoId, promoNombre, porcentajeDes) {
    var grp = _promoGrupos[promoNombre];
    if (!grp) return;
    var cant = parseInt(document.getElementById('cant-promo-' + grupoId) ? document.getElementById('cant-promo-' + grupoId).value : '1') || 1;

    var carrito = obtenerCarrito();
    var agregados = 0;

    grp.idProductos.forEach(function (idProd) {
        var prod = _productoMap[idProd];
        if (!prod) return;
        var precioDesc  = Math.round(prod.precio * (1 - porcentajeDes / 100) * 100) / 100;
        var labelTam    = (prod.tamanio && prod.tamanio !== 'Único') ? ' (' + prod.tamanio + ')' : '';
        var clave       = 'PACK-' + idProd + '-' + promoNombre.replace(/[^a-zA-Z0-9]/g, '_');
        var exist       = carrito.find(function (i) { return i.clave === clave; });
        if (exist) {
            exist.cantidad += cant;
        } else {
            carrito.push({ clave: clave, id: idProd, nombre: prod.nombre + labelTam + ' \uD83C\uDFF7\uFE0F', tamanio: prod.tamanio !== 'Único' ? prod.tamanio : '', precio: precioDesc, cantidad: cant });
        }
        agregados++;
    });

    if (agregados > 0) {
        guardarCarrito(carrito);
        mostrarToast('Pack "' + promoNombre + '" agregado: ' + agregados + ' productos con -' + porcentajeDes + '%');
    }
}

// ── Carrito local ─────────────────────────────────────────────────────────────

var CLAVE = 'carritoHawaiiana';
function obtenerCarrito() { try { return JSON.parse(localStorage.getItem(CLAVE) || '[]'); } catch (e) { return []; } }
function guardarCarrito(c) { localStorage.setItem(CLAVE, JSON.stringify(c)); actualizarBadge(); }
function actualizarBadge() {
    var total = obtenerCarrito().reduce(function (a, i) { return a + i.cantidad; }, 0);
    document.querySelectorAll('.badge-carrito').forEach(function (b) {
        b.textContent = total;
        b.style.display = total > 0 ? 'inline-flex' : 'none';
    });
}

function agregarAlCarrito(productoGrp, variacion, cantidad, nota) {
    if (!variacion) variacion = productoGrp.variaciones[0];
    nota = (nota && nota.trim()) ? nota.trim() : null;
    // Si tiene nota diferente, clave única para no mezclar items
    var clave = variacion.id + (nota ? '__' + nota.substring(0, 8).replace(/\s/g, '_') : '');
    var carrito = obtenerCarrito();
    var exist = carrito.find(function (i) { return i.clave === clave; });
    if (exist) { exist.cantidad += cantidad; }
    else carrito.push({
        clave: clave, id: variacion.id, nombre: productoGrp.nombre,
        tamanio: variacion.tamanio === 'Único' ? '' : variacion.tamanio,
        precio: variacion.precio, cantidad: cantidad,
        observaciones: nota  // Guardar nota como observaciones
    });
    guardarCarrito(carrito);
    mostrarToast(productoGrp.nombre + (variacion.tamanio !== 'Único' ? ' (' + variacion.tamanio + ')' : '') + ' agregado.');
}

function agregarDirecto(nombre) {
    var p = pizzas.find(function (x) { return x.nombre === nombre; });
    if (!p) return;
    agregarAlCarrito(p, p.variaciones[0], 1);
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function mostrarToast(msg) {
    var t = document.getElementById('toast-carrito');
    var m = document.getElementById('toast-mensaje');
    if (!t || !m) return;
    m.textContent = msg;
    t.classList.add('mostrar');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('mostrar'); }, 3000);
}

// ── Modal de tamaño ───────────────────────────────────────────────────────────

function abrirModal(nombreProducto) {
    productoSeleccionado = pizzas.find(function (p) { return p.nombre === nombreProducto; });
    if (!productoSeleccionado) return;
    var titulo = document.getElementById('modal-nombre-pizza');
    if (titulo) titulo.textContent = productoSeleccionado.nombre;
    var cont = document.getElementById('botones-tamano');
    variacionSeleccionada = productoSeleccionado.variaciones[0];
    if (cont) {
        cont.innerHTML = '';
        if (productoSeleccionado.variaciones.length > 1) {
            // Múltiples tamaños: mostrar botones de selección
            productoSeleccionado.variaciones.forEach(function (v) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn-tamano' + (v.id === variacionSeleccionada.id ? ' activo' : '');
                btn.innerHTML = '<strong>' + v.tamanio + '</strong><span>$' + v.precio + '</span>';
                btn.addEventListener('click', function () {
                    variacionSeleccionada = v;
                    cont.querySelectorAll('.btn-tamano').forEach(function (b) { b.classList.remove('activo'); });
                    btn.classList.add('activo');
                });
                cont.appendChild(btn);
            });
        } else {
            // Tamaño único: mostrar precio sin botones
            cont.innerHTML = '<p class="texto-principal mb-0"><span class="precio-destacado fs-5">$' +
                variacionSeleccionada.precio + '</span></p>';
        }
    }
    var inputCant = document.getElementById('modal-cantidad');
    if (inputCant) inputCant.value = 1;
    var inputNota = document.getElementById('modal-nota');
    if (inputNota) inputNota.value = '';
    new bootstrap.Modal(document.getElementById('modalPedirPizza')).show();
}

function confirmarAgregarPizza() {
    if (!productoSeleccionado || !variacionSeleccionada) return;
    var cant = parseInt(document.getElementById('modal-cantidad').value) || 1;
    var nota = (document.getElementById('modal-nota')?.value || '').trim() || null;
    agregarAlCarrito(productoSeleccionado, variacionSeleccionada, cant < 1 ? 1 : cant, nota);
    bootstrap.Modal.getInstance(document.getElementById('modalPedirPizza')).hide();
}

// ── Inicialización ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
    cargarCatalogoDesdeAPI();
    actualizarBadge();

    var btnOk = document.getElementById('btn-confirmar-pizza');
    if (btnOk) btnOk.addEventListener('click', confirmarAgregarPizza);

    document.querySelectorAll('.btn-filtro-cat').forEach(function (btn) {
        btn.addEventListener('click', function () { filtrar(this.dataset.filtro); });
    });

    var buscador = document.getElementById('buscador-menu');
    if (buscador) {
        buscador.addEventListener('input', function () {
            textoBusqueda = this.value;
            _paginaActual = 1;
            aplicarFiltros();
        });
    }
});
