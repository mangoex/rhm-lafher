// RHM CRM & Prenómina App Logic (Excel-Connected Edition)
document.addEventListener("DOMContentLoaded", () => {
  
  // 1. Initial State & Configuration
  const DEFAULT_CONFIG = {
    uma: 117.31,
    valesPct: 40,
    diasMes: 30.4,
    faPct: 11,
    aguinaldo: 15,
    prima: 25
  };

  let state = {
    employees: [],
    config: { ...DEFAULT_CONFIG },
    activeTab: "dashboard",
    selectedIncidenceEmployeeId: null,
    period: "16 al 30 Abr 2026"
  };

  // 2. Load State from Python API
  function loadState() {
    const dbIndicator = document.getElementById("db-status-indicator");
    if (dbIndicator) {
      dbIndicator.className = "badge warning";
      dbIndicator.innerHTML = '<i data-lucide="refresh-cw" style="width: 14px; height: 14px; animation: spin 1.5s linear infinite;"></i> Conectando...';
      if (window.lucide) lucide.createIcons();
    }

    fetch("/api/employees")
      .then(res => {
        if (!res.ok) throw new Error("Error de respuesta del servidor");
        return res.json();
      })
      .then(data => {
        state.employees = data.employees;
        state.config.uma = data.uma;
        state.period = data.period;

        if (dbIndicator) {
          dbIndicator.className = "badge success";
          dbIndicator.innerHTML = '<i data-lucide="database" style="width: 14px; height: 14px;"></i> BD: Excel Conectado';
        }
        
        // Update HTML period indicator
        const periodInd = document.getElementById("period-indicator");
        if (periodInd) {
          periodInd.textContent = `Periodo Activo: ${state.period}`;
        }

        // Render all views
        renderActiveView();
        if (window.lucide) lucide.createIcons();
      })
      .catch(err => {
        console.error("Error cargando base de datos Excel:", err);
        if (dbIndicator) {
          dbIndicator.className = "badge danger";
          dbIndicator.innerHTML = '<i data-lucide="database" style="width: 14px; height: 14px;"></i> BD: Desconectado';
        }
        showToast("Error al conectar con la base de datos Excel. Asegúrate de cerrar el archivo Excel si lo tienes abierto.", "error");
        if (window.lucide) lucide.createIcons();
      });
  }

  // 3. Payroll Math Calculations (Front-end Preview Engine)
  function getVacationDays(years) {
    if (years <= 0) return 12;
    if (years === 1) return 12;
    if (years === 2) return 14;
    if (years === 3) return 16;
    if (years === 4) return 18;
    if (years === 5) return 20;
    if (years <= 10) return 22;
    if (years <= 15) return 24;
    if (years <= 20) return 26;
    if (years <= 25) return 28;
    return 30;
  }

  function getFactorIntegracion(years, cfg) {
    const vac = getVacationDays(years);
    const ag = cfg.aguinaldo;
    const pr = cfg.prima / 100;
    return 1 + (ag / 365) + ((vac * pr) / 365);
  }

  function calculateEmployeePayroll(emp, cfg) {
    const activeDate = new Date("2026-04-30"); // Base target date of the sheet
    const ingresoDate = new Date(emp.ingreso);
    const diffTime = Math.abs(activeDate - ingresoDate);
    const yearsOfLabores = diffTime / (1000 * 60 * 60 * 24 * 365.25);
    const yearsCompleted = Math.max(1, Math.floor(yearsOfLabores));
    
    // Check if employee is in baja
    const isBaja = emp.baja !== null && emp.baja !== undefined && emp.baja !== "";
    
    // Factor de Integración
    const fi = isBaja ? 0 : getFactorIntegracion(yearsCompleted, cfg);
    const sdi = (emp.salario_diario && !isBaja) ? (emp.salario_diario * fi) : 0;
    
    // Nominal Perceptions
    const sueldoNominal = (emp.salario_diario && !isBaja) ? (emp.salario_diario * cfg.diasMes) : 0;
    const puntualidad = sdi > 0 ? (sdi * 0.10 * cfg.diasMes) : 0;
    const asistencia = sdi > 0 ? (sdi * 0.10 * cfg.diasMes) : 0;
    const valesDespensa = (emp.salario_diario && !isBaja) ? (cfg.uma * (cfg.valesPct / 100) * cfg.diasMes) : 0;
    const fondoAhorro = (emp.salario_diario && emp.fondo_ahorro_activo && !isBaja) ? (sueldoNominal * (cfg.faPct / 100)) : 0;
    
    const percepcionSueldos = sueldoNominal + puntualidad + asistencia + valesDespensa + fondoAhorro;
    
    // Other schemas components
    const asimilados = !isBaja ? (emp.asimilados || 0) : 0;
    const gasolina = !isBaja ? (emp.gasolina || 0) : 0;
    const socio = !isBaja ? (emp.socio || 0) : 0;
    const efectivo = !isBaja ? (emp.efectivo || 0) : 0;
    const facturado = !isBaja ? (emp.facturado || 0) : 0;
    const deudaCarro = !isBaja ? (emp.deuda_carro || 0) : 0;
    
    const totalOtros = asimilados + gasolina + socio + efectivo + facturado + deudaCarro;
    
    const sueldoBrutoMensual = percepcionSueldos + totalOtros;
    const sueldoBrutoQuincenalNormal = sueldoBrutoMensual / 2;
    
    // Incidences impact (Descuento por faltas)
    // Formula: Sueldo Bruto Quincenal Normal / 15 * faltas
    const faltas = emp.faltas || 0;
    const descuentoFaltas = (sueldoBrutoQuincenalNormal / 15) * faltas;
    const descuentoAdicional = emp.descuento_adicional || 0;
    
    // Final Net Quincenal
    const sueldoNetoQuincenal = Math.max(0, sueldoBrutoQuincenalNormal - descuentoFaltas - descuentoAdicional);
    
    return {
      antiguedad: yearsOfLabores,
      factorIntegracion: fi,
      sdi,
      sueldoNominal,
      puntualidad,
      asistencia,
      valesDespensa,
      fondoAhorro,
      percepcionSueldos,
      totalOtros,
      sueldoBrutoMensual,
      sueldoBrutoQuincenalNormal,
      descuentoFaltas,
      descuentoAdicional,
      sueldoNetoQuincenal,
      isBaja
    };
  }

  // 4. Tab Navigation LFT
  const navItems = document.querySelectorAll(".nav-item");
  const viewSections = document.querySelectorAll(".view-section");

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      navItems.forEach(nav => nav.classList.remove("active"));
      viewSections.forEach(sec => sec.classList.remove("active"));
      
      item.classList.add("active");
      const target = item.getAttribute("data-target");
      document.getElementById(target).classList.add("active");
      state.activeTab = target;
      
      // Refresh targeted view
      renderActiveView();
    });
  });

  function renderActiveView() {
    switch (state.activeTab) {
      case "dashboard":
        renderDashboard();
        break;
      case "collaborators":
        renderCollaborators();
        break;
      case "incidences":
        renderIncidences();
        break;
      case "prenomina":
        renderPrenomina();
        break;
      case "config":
        renderConfig();
        break;
    }
  }

  // 5. Toast Notifications Helper
  function showToast(message, type = "success") {
    const toast = document.getElementById("toast-notify");
    const toastMessage = document.getElementById("toast-message");
    const iconSuccess = document.getElementById("toast-icon-success");
    const iconWarning = document.getElementById("toast-icon-warning");
    const iconError = document.getElementById("toast-icon-error");
    
    toast.className = `toast-notification toast-${type} active`;
    toastMessage.textContent = message;
    
    iconSuccess.style.display = type === "success" ? "block" : "none";
    iconWarning.style.display = type === "warning" ? "block" : "none";
    iconError.style.display = type === "error" ? "block" : "none";
    
    setTimeout(() => {
      toast.classList.remove("active");
    }, 3500);
  }

  // 6. View Rendering - DASHBOARD
  function renderDashboard() {
    let activeCount = 0;
    let totalPayroll = 0;
    let totalDiscountedDays = 0;
    let totalFA = 0;
    
    const schemeCounts = {
      nominal: 0,
      asimilados: 0,
      gasolina: 0,
      socio: 0,
      efectivo: 0,
      facturado: 0
    };
    
    const schemeTotals = {
      nominal: 0,
      asimilados: 0,
      gasolina: 0,
      socio: 0,
      efectivo: 0,
      facturado: 0
    };

    state.employees.forEach(emp => {
      const calc = calculateEmployeePayroll(emp, state.config);
      if (!calc.isBaja) {
        activeCount++;
        totalPayroll += calc.sueldoNetoQuincenal;
        totalDiscountedDays += emp.faltas || 0;
        totalFA += calc.fondoAhorro;
        
        // Scheme tallies
        if (emp.salario_diario > 0) {
          schemeCounts.nominal++;
          schemeTotals.nominal += calc.sueldoNominal;
        }
        if (emp.asimilados > 0) {
          schemeCounts.asimilados++;
          schemeTotals.asimilados += emp.asimilados;
        }
        if (emp.gasolina > 0) {
          schemeCounts.gasolina++;
          schemeTotals.gasolina += emp.gasolina;
        }
        if (emp.socio > 0) {
          schemeCounts.socio++;
          schemeTotals.socio += emp.socio;
        }
        if (emp.efectivo > 0) {
          schemeCounts.efectivo++;
          schemeTotals.efectivo += emp.efectivo;
        }
        if (emp.facturado > 0) {
          schemeCounts.facturado++;
          schemeTotals.facturado += emp.facturado;
        }
      }
    });

    document.getElementById("stat-active-count").textContent = activeCount;
    document.getElementById("stat-payroll-cost").textContent = formatCurrency(totalPayroll);
    document.getElementById("stat-discounted-days").textContent = `${totalDiscountedDays} día${totalDiscountedDays !== 1 ? 's' : ''}`;
    document.getElementById("stat-savings-fund").textContent = formatCurrency(totalFA);

    // Render distribution table
    const distBody = document.getElementById("distribution-table-body");
    distBody.innerHTML = "";
    
    const totalSchemesSum = Object.values(schemeTotals).reduce((a, b) => a + b, 0);
    const components = [
      { name: "Sueldos Nominales (IMSS)", count: schemeCounts.nominal, total: schemeTotals.nominal },
      { name: "Honorarios Asimilados", count: schemeCounts.asimilados, total: schemeTotals.asimilados },
      { name: "Combustible (Gasolina)", count: schemeCounts.gasolina, total: schemeTotals.gasolina },
      { name: "Socios", count: schemeCounts.socio, total: schemeTotals.socio },
      { name: "Efectivo", count: schemeCounts.efectivo, total: schemeTotals.efectivo },
      { name: "Facturado (Comisiones)", count: schemeCounts.facturado, total: schemeTotals.facturado }
    ];

    components.forEach(comp => {
      const pct = totalSchemesSum > 0 ? ((comp.total / totalSchemesSum) * 100).toFixed(1) : 0;
      distBody.innerHTML += `
        <tr>
          <td style="font-weight: 500;">${comp.name}</td>
          <td><span class="badge info">${comp.count} colaborador${comp.count !== 1 ? 'es' : ''}</span></td>
          <td style="font-weight: 600;">${formatCurrency(comp.total)}</td>
          <td>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <div style="background: rgba(255,255,255,0.05); width:80px; height:6px; border-radius:3px; overflow:hidden;">
                <div style="background: var(--primary); width: ${pct}%; height: 100%;"></div>
              </div>
              <span>${pct}%</span>
            </div>
          </td>
        </tr>
      `;
    });

    // Render recent incidences
    const incidencesList = document.getElementById("recent-incidences-list");
    incidencesList.innerHTML = "";
    
    const employeesWithIncidences = state.employees.filter(emp => emp.faltas > 0 || emp.vacaciones > 0 || emp.retardos > 0 || emp.descuento_adicional > 0);
    
    if (employeesWithIncidences.length === 0) {
      incidencesList.innerHTML = `
        <div style="text-align:center; padding: 2rem; color: var(--text-dark);">
          <i data-lucide="check-circle" style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--success);"></i>
          <p>Sin incidencias registradas en este periodo.</p>
        </div>
      `;
    } else {
      employeesWithIncidences.forEach(emp => {
        let items = [];
        if (emp.faltas > 0) items.push(`${emp.faltas} falta${emp.faltas > 1 ? 's' : ''}`);
        if (emp.retardos > 0) items.push(`${emp.retardos} retardo${emp.retardos > 1 ? 's' : ''}`);
        if (emp.vacaciones > 0) items.push(`${emp.vacaciones} día${emp.vacaciones > 1 ? 's' : ''} de vacaciones`);
        if (emp.descuento_adicional > 0) items.push(`descuento de ${formatCurrency(emp.descuento_adicional)}`);

        incidencesList.innerHTML += `
          <div style="background: rgba(0,0,0,0.15); padding: 0.75rem 1rem; border-radius: 8px; border-left: 3px solid var(--danger); display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h4 style="font-size: 0.92rem; font-weight:600;">${emp.nombre}</h4>
              <p style="font-size: 0.8rem; color: var(--text-muted);">${items.join(", ")}</p>
            </div>
            <span class="badge danger">${emp.observaciones || 'Incidencia'}</span>
          </div>
        `;
      });
    }
    
    if (window.lucide) lucide.createIcons();
  }

  // 7. View Rendering - COLLABORATORS (CRM)
  const collSearch = document.getElementById("coll-search");
  const filterEmpresa = document.getElementById("filter-empresa");
  const filterArea = document.getElementById("filter-area");
  const filterStatus = document.getElementById("filter-status");

  [collSearch, filterEmpresa, filterArea, filterStatus].forEach(el => {
    if (el) el.addEventListener("input", renderCollaborators);
  });

  function renderCollaborators() {
    const tbody = document.getElementById("collaborators-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    
    const query = collSearch.value.toLowerCase().trim();
    const empresa = filterEmpresa.value;
    const area = filterArea.value;
    const status = filterStatus.value; // 'alta', 'baja', 'todos'

    const filtered = state.employees.filter(emp => {
      const matchSearch = emp.nombre.toLowerCase().includes(query) || 
                          emp.id.toLowerCase().includes(query) || 
                          emp.puesto.toLowerCase().includes(query);
      
      const matchEmpresa = !empresa || emp.empresa === empresa;
      const matchArea = !area || emp.area === area;
      
      const isBaja = emp.baja !== null && emp.baja !== undefined && emp.baja !== "";
      const matchStatus = status === "todos" || 
                          (status === "alta" && !isBaja) || 
                          (status === "baja" && isBaja);
                          
      return matchSearch && matchEmpresa && matchArea && matchStatus;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            No se encontraron colaboradores con los filtros seleccionados.
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach(emp => {
      const activeDate = new Date("2026-04-30");
      const diffTime = Math.abs(activeDate - new Date(emp.ingreso));
      const years = diffTime / (1000 * 60 * 60 * 24 * 365.25);
      
      const isBaja = emp.baja !== null && emp.baja !== undefined && emp.baja !== "";
      
      let schemes = [];
      if (emp.salario_diario > 0) schemes.push("Nominal IMSS");
      if (emp.asimilados > 0) schemes.push("Asimilados");
      if (emp.gasolina > 0) schemes.push("Gasolina");
      if (emp.socio > 0) schemes.push("Socio");
      if (emp.efectivo > 0) schemes.push("Efectivo");
      if (emp.facturado > 0) schemes.push("Facturado");
      if (emp.deuda_carro > 0) schemes.push("Carro");
      
      const initials = emp.nombre.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();

      tbody.innerHTML += `
        <tr>
          <td><span style="font-family: monospace; font-weight:600;">${emp.id}</span></td>
          <td>
            <div class="coll-row-flex">
              <div class="collaborator-avatar">${initials}</div>
              <div>
                <div style="font-weight: 600;">${emp.nombre}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">No. ${emp.no}</div>
              </div>
            </div>
          </td>
          <td>${emp.empresa}</td>
          <td>
            <div>${emp.area}</div>
            <div style="font-size:0.78rem; color:var(--text-dark);">${emp.depto}</div>
          </td>
          <td>${emp.puesto}</td>
          <td>${emp.ingreso}</td>
          <td>${years.toFixed(1)} años</td>
          <td>
            <div style="display:flex; flex-wrap:wrap; gap:0.25rem; max-width: 200px;">
              ${schemes.map(s => `<span class="badge info" style="font-size:0.65rem; padding: 0.1rem 0.35rem;">${s}</span>`).join("")}
            </div>
          </td>
          <td>
            <span class="badge ${isBaja ? 'danger' : 'success'}">${isBaja ? 'Baja' : 'Alta'}</span>
          </td>
          <td>
            <div class="action-buttons">
              <button class="btn btn-secondary btn-sm edit-coll-btn" data-id="${emp.id}" title="Editar Esquema">
                <i data-lucide="edit-3"></i>
              </button>
              <button class="btn ${isBaja ? 'btn-secondary' : 'btn-danger'} btn-sm toggle-status-btn" data-id="${emp.id}" title="${isBaja ? 'Reingreso' : 'Dar de Baja'}">
                <i data-lucide="${isBaja ? 'user-check' : 'user-x'}"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    // Attach actions
    document.querySelectorAll(".edit-coll-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        openCollaboratorModal(id);
      });
    });

    document.querySelectorAll(".toggle-status-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        toggleCollaboratorStatus(id);
      });
    });

    if (window.lucide) lucide.createIcons();
  }

  // 8. View Rendering - INCIDENCES
  const incSearchColl = document.getElementById("inc-search-coll");
  if (incSearchColl) {
    incSearchColl.addEventListener("input", renderIncidencesCollList);
  }

  function renderIncidences() {
    renderIncidencesCollList();
    
    // Select first employee in list if none selected
    const activeEmployees = state.employees.filter(e => !(e.baja));
    if (activeEmployees.length > 0 && !state.selectedIncidenceEmployeeId) {
      selectIncidenceEmployee(activeEmployees[0].id);
    } else if (state.selectedIncidenceEmployeeId) {
      selectIncidenceEmployee(state.selectedIncidenceEmployeeId);
    }
  }

  function renderIncidencesCollList() {
    const listDiv = document.getElementById("incidences-coll-list");
    if (!listDiv) return;
    listDiv.innerHTML = "";
    
    const query = incSearchColl.value.toLowerCase().trim();
    
    const filtered = state.employees.filter(emp => {
      const isBaja = emp.baja !== null && emp.baja !== undefined && emp.baja !== "";
      return !isBaja && (emp.nombre.toLowerCase().includes(query) || emp.id.toLowerCase().includes(query));
    });

    filtered.forEach(emp => {
      const activeClass = state.selectedIncidenceEmployeeId === emp.id ? "active" : "";
      let statusDot = "";
      if (emp.faltas > 0 || emp.descuento_adicional > 0) {
        statusDot = `<span class="badge warning" style="float:right; font-size:0.6rem; padding:0.15rem 0.35rem;">Incidencias</span>`;
      }
      
      listDiv.innerHTML += `
        <div class="list-item-coll ${activeClass}" data-id="${emp.id}">
          ${statusDot}
          <h4>${emp.nombre}</h4>
          <p>${emp.puesto} | Cód. ${emp.id}</p>
        </div>
      `;
    });

    // Add click listeners
    document.querySelectorAll(".list-item-coll").forEach(item => {
      item.addEventListener("click", () => {
        const id = item.getAttribute("data-id");
        selectIncidenceEmployee(id);
      });
    });
  }

  function selectIncidenceEmployee(id) {
    state.selectedIncidenceEmployeeId = id;
    
    document.querySelectorAll(".list-item-coll").forEach(item => {
      if (item.getAttribute("data-id") === id) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });

    const emp = state.employees.find(e => e.id === id);
    if (!emp) return;

    // Show form
    document.getElementById("inc-form-container").style.display = "block";
    document.getElementById("inc-coll-name").textContent = `Incidencias: ${emp.nombre}`;
    
    // Populate form values
    document.getElementById("inc-faltas").value = emp.faltas || 0;
    document.getElementById("inc-retardos").value = emp.retardos || 0;
    document.getElementById("inc-vacaciones").value = emp.vacaciones || 0;
    document.getElementById("inc-descuento-adicional").value = emp.descuento_adicional || 0;
    document.getElementById("inc-observaciones").value = emp.observaciones || "";
  }

  // Handle Incidence form submit (Connected POST)
  const formIncidence = document.getElementById("form-capture-incidence");
  if (formIncidence) {
    formIncidence.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!state.selectedIncidenceEmployeeId) return;

      const faltas = parseInt(document.getElementById("inc-faltas").value) || 0;
      const retardos = parseInt(document.getElementById("inc-retardos").value) || 0;
      const vacaciones = parseInt(document.getElementById("inc-vacaciones").value) || 0;
      const descuento_adicional = parseFloat(document.getElementById("inc-descuento-adicional").value) || 0.0;
      const observaciones = document.getElementById("inc-observaciones").value.trim();

      fetch("/api/incidences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: state.selectedIncidenceEmployeeId,
          faltas,
          descuento_adicional,
          observaciones
        })
      })
        .then(res => res.json())
        .then(resData => {
          if (resData.error) {
            showToast(resData.error, "error");
            return;
          }
          showToast("Incidencias guardadas en Excel con éxito.");
          loadState(); // Reload and redraw
        })
        .catch(err => {
          console.error("Error guardando incidencias:", err);
          showToast("Error al guardar incidencias en Excel. Verifica que el archivo no esté abierto.", "error");
        });
    });
  }

  // 9. View Rendering - PRE-PAYROLL (EXCEL SHEET VIEW)
  function renderPrenomina() {
    const tbody = document.getElementById("prenomina-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const totals = {
      salarioDiario: 0,
      sdi: 0,
      sueldoNominal: 0,
      puntualidad: 0,
      asistencia: 0,
      valesDespensa: 0,
      fondoAhorro: 0,
      percepcionSueldos: 0,
      asimilados: 0,
      gasolina: 0,
      socio: 0,
      efectivo: 0,
      facturado: 0,
      deudaCarro: 0,
      totalOtros: 0,
      brutoMensual: 0,
      brutoQuincenal: 0,
      descuentoFaltas: 0,
      descuentoAdicional: 0,
      netoQuincenal: 0
    };

    let idx = 1;
    state.employees.forEach(emp => {
      const calc = calculateEmployeePayroll(emp, state.config);
      
      if (!calc.isBaja) {
        totals.salarioDiario += emp.salario_diario || 0;
        totals.sdi += calc.sdi;
        totals.sueldoNominal += calc.sueldoNominal;
        totals.puntualidad += calc.puntualidad;
        totals.asistencia += calc.asistencia;
        totals.valesDespensa += calc.valesDespensa;
        totals.fondoAhorro += calc.fondoAhorro;
        totals.percepcionSueldos += calc.percepcionSueldos;
        totals.asimilados += emp.asimilados || 0;
        totals.gasolina += emp.gasolina || 0;
        totals.socio += emp.socio || 0;
        totals.efectivo += emp.efectivo || 0;
        totals.facturado += emp.facturado || 0;
        totals.deudaCarro += emp.deuda_carro || 0;
        totals.totalOtros += calc.totalOtros;
        totals.brutoMensual += calc.sueldoBrutoMensual;
        totals.brutoQuincenal += calc.sueldoBrutoQuincenalNormal;
        totals.descuentoFaltas += calc.descuentoFaltas;
        totals.descuentoAdicional += calc.descuentoAdicional;
        totals.netoQuincenal += calc.sueldoNetoQuincenal;
      }

      const rowClass = calc.isBaja ? 'style="opacity: 0.4;"' : '';
      const faLabel = calc.isBaja ? '-' : (emp.fondo_ahorro_activo ? 'SI' : 'NO');
      
      tbody.innerHTML += `
        <tr ${rowClass}>
          <td class="align-center">${calc.isBaja ? '-' : idx}</td>
          <td class="align-center" style="font-family:monospace; font-weight:600;">${emp.id}</td>
          <td class="align-center">${emp.empresa}</td>
          <td class="align-left" style="font-weight: 500;">
            ${emp.nombre}
            ${calc.isBaja ? '<span class="badge danger" style="font-size:0.55rem; padding:0.05rem 0.25rem; margin-left:0.25rem;">Baja</span>' : ''}
          </td>
          <td class="align-center">${emp.ingreso}</td>
          <td class="align-center">${calc.antiguedad.toFixed(1)}</td>
          <td class="align-center">${faLabel}</td>
          
          <!-- Nominal IMSS -->
          <td>${emp.salario_diario > 0 ? formatNumber(emp.salario_diario) : '-'}</td>
          <td>${calc.factorIntegracion > 0 ? calc.factorIntegracion.toFixed(4) : '-'}</td>
          <td>${calc.sdi > 0 ? formatNumber(calc.sdi) : '-'}</td>
          <td>${calc.sueldoNominal > 0 ? formatNumber(calc.sueldoNominal) : '-'}</td>
          <td>${calc.puntualidad > 0 ? formatNumber(calc.puntualidad) : '-'}</td>
          <td>${calc.asistencia > 0 ? formatNumber(calc.asistencia) : '-'}</td>
          <td>${calc.valesDespensa > 0 ? formatNumber(calc.valesDespensa) : '-'}</td>
          <td>${calc.fondoAhorro > 0 ? formatNumber(calc.fondoAhorro) : '-'}</td>
          <td style="font-weight: 600;">${calc.percepcionSueldos > 0 ? formatNumber(calc.percepcionSueldos) : '-'}</td>
          
          <!-- Otros Conceptos -->
          <td>${emp.asimilados > 0 ? formatNumber(emp.asimilados) : '-'}</td>
          <td>${emp.gasolina > 0 ? formatNumber(emp.gasolina) : '-'}</td>
          <td>${emp.socio > 0 ? formatNumber(emp.socio) : '-'}</td>
          <td>${emp.efectivo > 0 ? formatNumber(emp.efectivo) : '-'}</td>
          <td>${emp.facturado > 0 ? formatNumber(emp.facturado) : '-'}</td>
          <td>${emp.deuda_carro > 0 ? formatNumber(emp.deuda_carro) : '-'}</td>
          <td style="font-weight: 600;">${calc.totalOtros > 0 ? formatNumber(calc.totalOtros) : '-'}</td>
          
          <!-- Sueldos Totales y Ajustes -->
          <td style="font-weight: 600;">${calc.sueldoBrutoMensual > 0 ? formatNumber(calc.sueldoBrutoMensual) : '-'}</td>
          <td>${calc.sueldoBrutoQuincenalNormal > 0 ? formatNumber(calc.sueldoBrutoQuincenalNormal) : '-'}</td>
          <td class="${calc.descuentoFaltas > 0 ? 'overridden-cell' : ''}">${calc.descuentoFaltas > 0 ? formatNumber(calc.descuentoFaltas) : '-'}</td>
          <td class="${calc.descuentoAdicional > 0 ? 'overridden-cell' : ''}">${calc.descuentoAdicional > 0 ? formatNumber(calc.descuentoAdicional) : '-'}</td>
          <td style="font-weight: 700; color: #fff; background: rgba(99,102,241,0.05);">${calc.sueldoNetoQuincenal > 0 ? formatNumber(calc.sueldoNetoQuincenal) : '-'}</td>
          <td class="align-left" style="font-size:0.75rem; color: var(--text-muted); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${emp.observaciones || ''}">${emp.observaciones || '-'}</td>
        </tr>
      `;
      
      if (!calc.isBaja) idx++;
    });

    tbody.innerHTML += `
      <tr class="total-row">
        <td colspan="7" class="align-left">TOTALES / SUMAS GENERALES</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td>${formatNumber(totals.sueldoNominal)}</td>
        <td>${formatNumber(totals.puntualidad)}</td>
        <td>${formatNumber(totals.asistencia)}</td>
        <td>${formatNumber(totals.valesDespensa)}</td>
        <td>${formatNumber(totals.fondoAhorro)}</td>
        <td>${formatNumber(totals.percepcionSueldos)}</td>
        
        <td>${formatNumber(totals.asimilados)}</td>
        <td>${formatNumber(totals.gasolina)}</td>
        <td>${formatNumber(totals.socio)}</td>
        <td>${formatNumber(totals.efectivo)}</td>
        <td>${formatNumber(totals.facturado)}</td>
        <td>${formatNumber(totals.deudaCarro)}</td>
        <td>${formatNumber(totals.totalOtros)}</td>
        
        <td>${formatNumber(totals.brutoMensual)}</td>
        <td>${formatNumber(totals.brutoQuincenal)}</td>
        <td>${formatNumber(totals.descuentoFaltas)}</td>
        <td>${formatNumber(totals.descuentoAdicional)}</td>
        <td>${formatNumber(totals.netoQuincenal)}</td>
        <td>-</td>
      </tr>
    `;
  }

  // 10. View Rendering - CONFIGURATION (Connected POST)
  const formConfig = document.getElementById("form-config");
  if (formConfig) {
    formConfig.addEventListener("submit", (e) => {
      e.preventDefault();
      const uma = parseFloat(document.getElementById("cfg-uma").value) || 117.31;

      fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uma: uma })
      })
        .then(res => res.json())
        .then(resData => {
          if (resData.error) {
            showToast(resData.error, "error");
            return;
          }
          showToast("Configuración de UMA guardada en Excel con éxito.");
          loadState();
        })
        .catch(err => {
          console.error("Error guardando config:", err);
          showToast("Error al escribir UMA en Excel. Verifica que el archivo no esté bloqueado.", "error");
        });
    });
  }

  function renderConfig() {
    document.getElementById("cfg-uma").value = state.config.uma;
    document.getElementById("cfg-vales-pct").value = state.config.valesPct;
    document.getElementById("cfg-dias-mes").value = state.config.diasMes;
    document.getElementById("cfg-fa-pct").value = state.config.faPct;
    document.getElementById("cfg-aguinaldo").value = state.config.aguinaldo;
    document.getElementById("cfg-prima").value = state.config.prima;
  }

  // 11. Modal Handle: Alta / Edición Colaboradores
  const modal = document.getElementById("modal-collaborator");
  const btnAdd = document.getElementById("btn-add-collaborator");
  const btnClose = document.getElementById("modal-close-btn");
  const btnCancel = document.getElementById("modal-cancel-btn");
  const formColl = document.getElementById("form-collaborator");
  
  const checkNominal = document.getElementById("check-nominal");
  const groupSalarioDiario = document.getElementById("group-salario-diario");
  const groupFAToggle = document.getElementById("group-fa-toggle");

  if (checkNominal) {
    checkNominal.addEventListener("change", () => {
      const isChecked = checkNominal.checked;
      groupSalarioDiario.style.opacity = isChecked ? "1" : "0.4";
      document.getElementById("col-salario-diario").disabled = !isChecked;
      groupFAToggle.style.opacity = isChecked ? "1" : "0.4";
      document.getElementById("col-fa-activo").disabled = !isChecked;
    });
  }

  if (btnAdd) {
    btnAdd.addEventListener("click", () => {
      openCollaboratorModal(null);
    });
  }

  [btnClose, btnCancel].forEach(btn => {
    if (btn) {
      btn.addEventListener("click", () => {
        modal.classList.remove("active");
      });
    }
  });

  function openCollaboratorModal(id = null) {
    modal.classList.add("active");
    formColl.reset();
    
    if (id) {
      document.getElementById("modal-title").textContent = "Editar Esquema del Colaborador";
      const emp = state.employees.find(e => e.id === id);
      if (!emp) return;

      document.getElementById("edit-col-index").value = id;
      document.getElementById("col-no").value = emp.no || "";
      document.getElementById("col-cod").value = emp.id;
      document.getElementById("col-cod").readOnly = true;
      document.getElementById("col-nombre").value = emp.nombre;
      document.getElementById("col-empresa").value = emp.empresa;
      document.getElementById("col-area").value = emp.area;
      document.getElementById("col-depto").value = emp.depto;
      document.getElementById("col-puesto").value = emp.puesto;
      document.getElementById("col-lugar").value = emp.lugar;
      document.getElementById("col-ingreso").value = emp.ingreso;
      document.getElementById("col-baja").value = emp.baja || "";

      const hasNominal = emp.salario_diario > 0;
      checkNominal.checked = hasNominal;
      document.getElementById("col-salario-diario").value = emp.salario_diario || 0.0;
      document.getElementById("col-salario-diario").disabled = !hasNominal;
      document.getElementById("col-fa-activo").checked = emp.fondo_ahorro_activo || false;
      document.getElementById("col-fa-activo").disabled = !hasNominal;
      
      groupSalarioDiario.style.opacity = hasNominal ? "1" : "0.4";
      groupFAToggle.style.opacity = hasNominal ? "1" : "0.4";

      document.getElementById("col-asimilados").value = emp.asimilados || 0.0;
      document.getElementById("col-gasolina").value = emp.gasolina || 0.0;
      document.getElementById("col-socio").value = emp.socio || 0.0;
      document.getElementById("col-efectivo").value = emp.efectivo || 0.0;
      document.getElementById("col-facturado").value = emp.facturado || 0.0;
      document.getElementById("col-deuda-carro").value = emp.deuda_carro || 0.0;
    } else {
      document.getElementById("modal-title").textContent = "Dar de Alta Colaborador";
      document.getElementById("edit-col-index").value = "";
      document.getElementById("col-cod").value = "";
      document.getElementById("col-cod").readOnly = false;
      
      checkNominal.checked = true;
      document.getElementById("col-salario-diario").disabled = false;
      document.getElementById("col-fa-activo").disabled = false;
      groupSalarioDiario.style.opacity = "1";
      groupFAToggle.style.opacity = "1";
    }
  }

  // Handle save collaborator (Connected POST)
  if (formColl) {
    formColl.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = document.getElementById("edit-col-index").value;
      const cod = document.getElementById("col-cod").value.trim();

      if (!id) {
        const exists = state.employees.some(emp => emp.id === cod);
        if (exists) {
          showToast(`El código checador ${cod} ya existe en Excel.`, "error");
          return;
        }
      }

      const salarioDiario = checkNominal.checked ? parseFloat(document.getElementById("col-salario-diario").value) || 0 : 0;
      const fondoAhorroActivo = checkNominal.checked ? document.getElementById("col-fa-activo").checked : false;

      const data = {
        id: cod,
        no: document.getElementById("col-no").value.trim(),
        nombre: document.getElementById("col-nombre").value.trim(),
        empresa: document.getElementById("col-empresa").value,
        area: document.getElementById("col-area").value.trim(),
        depto: document.getElementById("col-depto").value.trim(),
        puesto: document.getElementById("col-puesto").value.trim(),
        lugar: document.getElementById("col-lugar").value.trim(),
        ingreso: document.getElementById("col-ingreso").value,
        baja: document.getElementById("col-baja").value || null,
        fondo_ahorro_activo: fondoAhorroActivo,
        
        salario_diario: salarioDiario,
        asimilados: parseFloat(document.getElementById("col-asimilados").value) || 0.0,
        gasolina: parseFloat(document.getElementById("col-gasolina").value) || 0.0,
        socio: parseFloat(document.getElementById("col-socio").value) || 0.0,
        efectivo: parseFloat(document.getElementById("col-efectivo").value) || 0.0,
        facturado: parseFloat(document.getElementById("col-facturado").value) || 0.0,
        deuda_carro: parseFloat(document.getElementById("col-deuda-carro").value) || 0.0
      };

      const isEdit = !!id;
      fetch("/api/collaborator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      })
        .then(res => res.json())
        .then(resData => {
          if (resData.error) {
            showToast(resData.error, "error");
            return;
          }
          showToast(isEdit ? "Cambios guardados en Excel con éxito." : "Colaborador insertado físicamente en Excel.");
          modal.classList.remove("active");
          loadState(); // Reload and redraw
        })
        .catch(err => {
          console.error("Error al guardar colaborador:", err);
          showToast("Error al escribir colaborador en Excel. Asegúrate de cerrar el archivo si lo tienes abierto.", "error");
        });
    });
  }

  // Toggle Status: Alta / Baja (Connected POST)
  function toggleCollaboratorStatus(id) {
    const emp = state.employees.find(e => e.id === id);
    if (!emp) return;

    const isCurrentlyBaja = emp.baja !== null && emp.baja !== undefined && emp.baja !== "";
    const updatedBaja = isCurrentlyBaja ? null : new Date().toISOString().split("T")[0];
    
    const updatedData = {
      ...emp,
      baja: updatedBaja
    };

    fetch("/api/collaborator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedData)
    })
      .then(res => res.json())
      .then(resData => {
        if (resData.error) {
          showToast(resData.error, "error");
          return;
        }
        showToast(isCurrentlyBaja ? `${emp.nombre} ha reingresado en Excel.` : `${emp.nombre} ha sido dado de baja en Excel.`);
        loadState();
      })
      .catch(err => {
        console.error("Error cambiando estado:", err);
        showToast("Error al actualizar estado en Excel. ¿Está bloqueado el archivo?", "error");
      });
  }

  // 12. Refresh and Recalculate (Reload Excel data)
  const btnRecalculate = document.getElementById("btn-recalculate");
  if (btnRecalculate) {
    btnRecalculate.addEventListener("click", () => {
      loadState();
      showToast("Datos recargados desde el archivo Excel.");
    });
  }

  // Sync button (Informational helper)
  const btnSyncExcel = document.getElementById("btn-sync-excel");
  if (btnSyncExcel) {
    btnSyncExcel.addEventListener("click", () => {
      loadState();
      showToast("Excel actualizado y datos recargados con éxito.");
    });
  }

  // 13. Theme Toggle Logic
  const themeToggle = document.getElementById("theme-toggle");
  const sunIcon = document.querySelector(".sun-icon");
  const moonIcon = document.querySelector(".moon-icon");

  if (themeToggle) {
    const currentTheme = localStorage.getItem("rhm_theme") || "dark";
    document.documentElement.setAttribute("data-theme", currentTheme);
    updateThemeIcons(currentTheme);

    themeToggle.addEventListener("click", () => {
      const theme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("rhm_theme", theme);
      updateThemeIcons(theme);
      showToast(`Modo ${theme === 'dark' ? 'oscuro' : 'claro'} activado.`);
    });
  }

  function updateThemeIcons(theme) {
    if (!sunIcon || !moonIcon) return;
    if (theme === "dark") {
      sunIcon.style.display = "block";
      moonIcon.style.display = "none";
    } else {
      sunIcon.style.display = "none";
      moonIcon.style.display = "block";
    }
  }

  // 14. Formatter helpers
  function formatCurrency(val) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);
  }

  function formatNumber(val) {
    return new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  }

  // 15. Initialize Application
  loadState();

});
