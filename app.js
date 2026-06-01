// RHM CRM & Prenómina App Logic (Dynamic AI-Connected Edition)

// Global Fetch Interceptor for Authentication
(function() {
  const originalFetch = window.fetch;
  window.fetch = async function(resource, init) {
    const token = localStorage.getItem("rhm_session_token");
    if (token) {
      init = init || {};
      init.headers = init.headers || {};
      if (init.headers instanceof Headers) {
        init.headers.set("Authorization", `Bearer ${token}`);
      } else if (Array.isArray(init.headers)) {
        const hasAuth = init.headers.some(h => h[0] === "Authorization");
        if (!hasAuth) {
          init.headers.push(["Authorization", `Bearer ${token}`]);
        }
      } else {
        init.headers["Authorization"] = `Bearer ${token}`;
      }
    }
    const response = await originalFetch(resource, init);
    if (response.status === 401 && !resource.toString().includes("/api/login")) {
      // Session expired or invalid
      localStorage.removeItem("rhm_session_token");
      localStorage.removeItem("rhm_user_role");
      localStorage.removeItem("rhm_username");
      showLoginScreen();
    }
    return response;
  };
})();

function showLoginScreen() {
  const loginScreen = document.getElementById("login-screen");
  if (loginScreen) {
    loginScreen.style.display = "flex";
  }
}

function hideLoginScreen() {
  const loginScreen = document.getElementById("login-screen");
  if (loginScreen) {
    loginScreen.style.display = "none";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  
  // Helper functions for AI configuration status
  function toggleAIProviderModels(provider) {
    const modelSelect = document.getElementById("cfg-ai-model-select");
    if (!modelSelect) return;
    
    const options = modelSelect.options;
    
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      if (opt.value === "custom") continue;
      
      const isOrOption = opt.classList.contains("or-option");
      if (provider === "openrouter") {
        if (isOrOption) {
          opt.style.display = "";
        } else {
          opt.style.display = "none";
        }
      } else {
        if (isOrOption) {
          opt.style.display = "none";
        } else {
          opt.style.display = "";
        }
      }
    }
  }

  function updateAIStatusUI() {
    fetch("/api/ai-status?_t=" + Date.now())
      .then(res => res.json())
      .then(data => {
        const badge = document.getElementById("ai-key-status-badge");
        const keyInput = document.getElementById("cfg-ai-key");
        const chatInput = document.getElementById("ai-chat-input");
        const chatSend = document.getElementById("btn-ai-chat-send");
        
        if (badge) {
          if (data.configured) {
            badge.className = "badge success";
            badge.innerHTML = `<i data-lucide="check-circle" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Conectado / Clave Guardada`;
            if (keyInput) {
              keyInput.value = "";
              keyInput.placeholder = "•••••••••••••••••••••••• (Clave Guardada)";
            }
            if (chatInput) chatInput.disabled = false;
            if (chatSend) chatSend.disabled = false;
          } else {
            badge.className = "badge danger";
            badge.innerHTML = `<i data-lucide="x-circle" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Sin Clave / Desconectado`;
            if (keyInput) {
              keyInput.placeholder = "Introduce tu clave API...";
            }
            if (chatInput) chatInput.disabled = true;
            if (chatSend) chatSend.disabled = true;
          }
          if (window.lucide) lucide.createIcons();
        }
      })
      .catch(err => console.error("Error fetching AI status:", err));
  }

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
    schema: null,
    config: { ...DEFAULT_CONFIG },
    activeTab: "dashboard",
    selectedIncidenceEmployeeId: null,
    period: "16 al 30 Abr 2026",
    currentEmployeeIncidences: []
  };

  // 2. Load State from Python API
  function loadState() {
    const dbIndicator = document.getElementById("db-status-indicator");
    if (dbIndicator) {
      dbIndicator.className = "badge warning";
      dbIndicator.innerHTML = '<i data-lucide="refresh-cw" style="width: 16px; height: 16px; animation: spin 1.5s linear infinite;"></i>';
      dbIndicator.title = "Conectando con base de datos...";
      if (window.lucide) lucide.createIcons();
    }

    // Fetch dynamic schema configuration first
    return fetch("/api/schema?_t=" + Date.now())
      .then(res => {
        if (!res.ok) throw new Error("Error cargando esquema");
        return res.json();
      })
      .then(schemaData => {
        state.schema = schemaData;
        
        // Populate AI configuration fields
        const providerSelect = document.getElementById("cfg-ai-provider");
        const modelSelect = document.getElementById("cfg-ai-model-select");
        const modelCustomGroup = document.getElementById("cfg-ai-model-custom-group");
        const modelCustomInput = document.getElementById("cfg-ai-model-custom");
        
        if (providerSelect) {
          const provider = schemaData.ai_provider || "google";
          providerSelect.value = provider;
          toggleAIProviderModels(provider);
          
          if (modelSelect) {
            const model = schemaData.ai_model || "gemini-2.0-flash";
            // Check if model exists as an option
            let optionExists = false;
            for (let i = 0; i < modelSelect.options.length; i++) {
              if (modelSelect.options[i].value === model) {
                optionExists = true;
                break;
              }
            }
            
            if (optionExists) {
              modelSelect.value = model;
              if (modelCustomGroup) modelCustomGroup.style.display = "none";
            } else {
              modelSelect.value = "custom";
              if (modelCustomGroup) modelCustomGroup.style.display = "flex";
              if (modelCustomInput) modelCustomInput.value = model;
            }
          }
        }
        
        // Fetch and update AI API key configuration status
        updateAIStatusUI();

        // Show clarifications banner if pending
        renderClarificationBanner();

        // Populate dynamic inputs in collaborator and incidences forms
        generateDynamicInputs();

        // Now load employees
        return fetch("/api/employees?_t=" + Date.now());
      })
      .then(res => {
        if (!res.ok) throw new Error("Error de respuesta del servidor");
        return res.json();
      })
      .then(data => {
        state.employees = data.employees;
        if (data.config) {
          state.config = { ...state.config, ...data.config };
        } else if (data.uma) {
          state.config.uma = data.uma;
        }
        state.db_path = data.db_path || "Nomina ciega.xlsx";
        state.period = data.period;

        if (dbIndicator) {
          dbIndicator.className = "badge success";
          dbIndicator.innerHTML = '<i data-lucide="database" style="width: 16px; height: 16px;"></i>';
          dbIndicator.title = "Base de datos Excel conectada";
        }
        
        const periodSelect = document.getElementById("period-select");
        if (periodSelect) {
          periodSelect.value = state.period;
        }

        renderActiveView();
        if (window.lucide) lucide.createIcons();
      })
      .catch(err => {
        console.error("Error cargando base de datos Excel:", err);
        if (dbIndicator) {
          dbIndicator.className = "badge danger";
          dbIndicator.innerHTML = '<i data-lucide="database" style="width: 16px; height: 16px;"></i>';
          dbIndicator.title = "Base de datos Excel desconectada / bloqueada";
        }
        showToast("Error al conectar con la base de datos Excel. Asegúrate de cerrar el archivo Excel si lo tienes abierto.", "error");
        if (window.lucide) lucide.createIcons();
      });
  }

  // 3. Dynamic input field generation
  function generateDynamicInputs() {
    // 1. Collaborator form dynamic payments
    const container = document.getElementById("collaborator-dynamic-fields");
    if (container && state.schema && state.schema.columns) {
      container.innerHTML = "";
      const otherCols = state.schema.columns.filter(col => col.category === "others" && col.editable);
      otherCols.forEach(col => {
        container.innerHTML += `
          <div class="form-group">
            <label for="col-${col.field}">${col.label}</label>
            <input type="number" id="col-${col.field}" min="0" step="0.01" value="0.0">
          </div>
        `;
      });
    }

    // 2. Dynamic incidences deductions
    const incContainer = document.getElementById("incidences-dynamic-fields");
    if (incContainer && state.schema && state.schema.columns) {
      incContainer.innerHTML = "";
      const deductions = state.schema.columns.filter(col => col.category === "deduction" && col.incidence_editable);
      deductions.forEach(col => {
        incContainer.innerHTML += `
          <div class="form-group">
            <label for="inc-${col.field}">${col.label}</label>
            <input type="number" id="inc-${col.field}" min="0" value="0" step="0.01" placeholder="Ej. Préstamo">
          </div>
        `;
      });
    }
  }

  // 4. Render Agent Clarifications Banner
  function renderClarificationBanner() {
    const banner = document.getElementById("schema-clarification-banner");
    const list = document.getElementById("clarification-questions-list");
    if (!banner || !list) return;

    const questions = state.schema.pending_clarifications || [];
    if (questions.length === 0) {
      banner.style.display = "none";
      return;
    }

    banner.style.display = "block";
    list.innerHTML = "";

    questions.forEach(q => {
      list.innerHTML += `
        <div class="clarify-card" style="background: rgba(0,0,0,0.15); padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); margin-top: 0.5rem;">
          <h4 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 0.5rem; color: #fff;">${q.question}</h4>
          <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
            ${q.options.map(opt => `
              <button type="button" class="btn btn-secondary btn-sm clarify-opt-btn" data-field="${q.field}" data-answer="${opt}">${opt}</button>
            `).join("")}
          </div>
        </div>
      `;
    });

    // Attach click events
    document.querySelectorAll(".clarify-opt-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const field = btn.getAttribute("data-field");
        const answer = btn.getAttribute("data-answer");
        submitClarification(field, answer);
      });
    });
  }

  function submitClarification(field, answer) {
    fetch("/api/schema/clarify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, answer })
    })
      .then(res => res.json())
      .then(resData => {
        if (resData.error) {
          showToast(resData.error, "error");
          return;
        }
        showToast("Aclaración guardada con éxito. Reconfigurando esquema.");
        loadState();
      })
      .catch(err => {
        console.error("Error submitting clarification:", err);
        showToast("Error al guardar respuesta en el Agente.", "error");
      });
  }

  // 5. Payroll Math Calculations (Front-end Preview Engine)
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
    const activeDate = new Date("2026-04-30"); // Base target date
    const ingresoDate = new Date(emp.ingreso);
    const diffTime = Math.abs(activeDate - ingresoDate);
    const yearsOfLabores = diffTime / (1000 * 60 * 60 * 24 * 365.25);
    const yearsCompleted = Math.max(1, Math.floor(yearsOfLabores));
    
    const isBaja = emp.baja !== null && emp.baja !== undefined && emp.baja !== "";
    
    // Factor de Integración
    const fi = isBaja ? 0 : getFactorIntegracion(yearsCompleted, cfg);
    const sdi = (emp.salario_diario && !isBaja) ? (emp.salario_diario * fi) : 0;
    
    // Nominal Perceptions
    const sueldoNominal = (emp.salario_diario && !isBaja) ? (emp.salario_diario * cfg.diasMes) : 0;
    const puntualidad = (emp.salario_diario && emp.puntualidad === 0) ? 0 : (sdi > 0 ? (sdi * 0.10 * cfg.diasMes) : 0);
    const asistencia = (emp.salario_diario && emp.asistencia === 0) ? 0 : (sdi > 0 ? (sdi * 0.10 * cfg.diasMes) : 0);
    const valesDespensa = (emp.salario_diario && !isBaja) ? (cfg.uma * (cfg.valesPct / 100) * cfg.diasMes) : 0;
    const fondoAhorro = (emp.salario_diario && emp.fondo_ahorro_activo && !isBaja) ? (sueldoNominal * (cfg.faPct / 100)) : 0;
    
    const percepcionSueldos = sueldoNominal + puntualidad + asistencia + valesDespensa + fondoAhorro;
    
    // Dynamic Other payment components sum
    let totalOtros = 0;
    if (state.schema && state.schema.columns) {
      const otherCols = state.schema.columns.filter(c => c.category === "others");
      otherCols.forEach(col => {
        const val = !isBaja ? (emp[col.field] || 0.0) : 0.0;
        totalOtros += val;
      });
    }
    
    const sueldoBrutoMensual = percepcionSueldos + totalOtros;
    const sueldoBrutoQuincenalNormal = sueldoBrutoMensual / 2;
    
    // Absences deduction impact
    const faltas = emp.faltas || 0;
    const descuentoFaltas = (sueldoBrutoQuincenalNormal / 15) * faltas;
    
    // Dynamic Additional Deductions sum
    let descuentoAdicional = 0;
    if (state.schema && state.schema.columns) {
      const deductionCols = state.schema.columns.filter(c => c.category === "deduction");
      deductionCols.forEach(col => {
        const val = !isBaja ? (emp[col.field] || 0.0) : 0.0;
        descuentoAdicional += val;
      });
    }
    
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

  // 6. Tab Navigation
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

  // 7. Toast Notifications
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

  // 8. View Rendering - DASHBOARD
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
        
        if (emp.salario_diario > 0) {
          schemeCounts.nominal++;
          schemeTotals.nominal += calc.sueldoNominal;
        }
        
        // Add dynamic payments count
        if (emp.asimilados > 0) { schemeCounts.asimilados++; schemeTotals.asimilados += emp.asimilados; }
        if (emp.gasolina > 0) { schemeCounts.gasolina++; schemeTotals.gasolina += emp.gasolina; }
        if (emp.socio > 0) { schemeCounts.socio++; schemeTotals.socio += emp.socio; }
        if (emp.efectivo > 0) { schemeCounts.efectivo++; schemeTotals.efectivo += emp.efectivo; }
        if (emp.facturado > 0) { schemeCounts.facturado++; schemeTotals.facturado += emp.facturado; }
      }
    });

    document.getElementById("stat-active-count").textContent = activeCount;
    document.getElementById("stat-payroll-cost").textContent = formatCurrency(totalPayroll);
    document.getElementById("stat-discounted-days").textContent = `${totalDiscountedDays} día${totalDiscountedDays !== 1 ? 's' : ''}`;
    document.getElementById("stat-savings-fund").textContent = formatCurrency(totalFA);

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

  // 9. View Rendering - COLLABORATORS (CRM)
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
    const status = filterStatus.value;

    const filtered = state.employees.filter(emp => {
      const name = (emp.nombre || "").toString().toLowerCase();
      const code = (emp.id || "").toString().toLowerCase();
      const puesto = (emp.puesto || "").toString().toLowerCase();
      const matchSearch = name.includes(query) || 
                          code.includes(query) || 
                          puesto.includes(query);
      
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
      
      // Dynamic payment display list
      if (state.schema && state.schema.columns) {
        state.schema.columns.forEach(col => {
          if (col.category === "others" && emp[col.field] > 0) {
            schemes.push(col.label.split("(")[0].trim());
          }
        });
      }
      
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

    document.querySelectorAll(".edit-coll-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        openCollaboratorModal(btn.getAttribute("data-id"));
      });
    });

    document.querySelectorAll(".toggle-status-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        toggleCollaboratorStatus(btn.getAttribute("data-id"));
      });
    });

    if (window.lucide) lucide.createIcons();
  }

  // 10. View Rendering - INCIDENCES
  const incSearchColl = document.getElementById("inc-search-coll");
  if (incSearchColl) {
    incSearchColl.addEventListener("input", renderIncidencesCollList);
  }

  function renderIncidences() {
    renderIncidencesCollList();
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
      const name = (emp.nombre || "").toString().toLowerCase();
      const code = (emp.id || "").toString().toLowerCase();
      return !isBaja && (name.includes(query) || code.includes(query));
    });

    filtered.forEach(emp => {
      const activeClass = state.selectedIncidenceEmployeeId === emp.id ? "active" : "";
      
      // Calculate dynamic deductions flag
      let hasIncidences = emp.faltas > 0;
      if (state.schema && state.schema.columns) {
        state.schema.columns.filter(c => c.category === "deduction").forEach(c => {
          if (emp[c.field] > 0) hasIncidences = true;
        });
      }
      
      const statusDot = hasIncidences ? `<span class="badge warning" style="float:right; font-size:0.6rem; padding:0.15rem 0.35rem;">Incidencias</span>` : "";
      
      listDiv.innerHTML += `
        <div class="list-item-coll ${activeClass}" data-id="${emp.id}">
          ${statusDot}
          <h4>${emp.nombre}</h4>
          <p>${emp.puesto} | Cód. ${emp.id}</p>
        </div>
      `;
    });

    document.querySelectorAll(".list-item-coll").forEach(item => {
      item.addEventListener("click", () => {
        selectIncidenceEmployee(item.getAttribute("data-id"));
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

    document.getElementById("inc-form-container").style.display = "block";
    document.getElementById("inc-coll-name").textContent = `Incidencias: ${emp.nombre}`;
    
    const dateInput = document.getElementById("inc-fecha");
    if (dateInput) {
      dateInput.value = getPeriodDefaultDate(state.period);
    }
    
    loadIncidencesForSelectedEmployee(id);
  }

  function loadIncidencesForSelectedEmployee(id) {
    const historyContainer = document.getElementById("incidence-history-container");
    if (!historyContainer) return Promise.resolve();

    historyContainer.innerHTML = '<div style="text-align:center; padding: 1rem;"><i data-lucide="refresh-cw" class="spin" style="width: 18px; height: 18px;"></i> Cargando historial...</div>';
    if (window.lucide) lucide.createIcons();

    return fetch(`/api/incidences?id=${encodeURIComponent(id)}`, {
      headers: {
        "Authorization": "Bearer " + (localStorage.getItem("rhm_session_token") || "")
      }
    })
      .then(res => {
        if (!res.ok) throw new Error("Error cargando historial de incidencias");
        return res.json();
      })
      .then(incidences => {
        state.currentEmployeeIncidences = incidences;
        renderIncidenceHistory(incidences);
        applyIncidenceValuesForSelectedDate();
      })
      .catch(err => {
        console.error("Error loading incidences history:", err);
        historyContainer.innerHTML = '<div style="color: var(--danger); text-align:center; padding: 1rem;">Error al cargar historial</div>';
      });
  }

  function renderIncidenceHistory(incidences) {
    const historyContainer = document.getElementById("incidence-history-container");
    if (!historyContainer) return;

    if (incidences.length === 0) {
      historyContainer.innerHTML = `
        <h4 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-muted);">Incidencias Registradas en la Quincena</h4>
        <div style="font-size: 0.8rem; color: var(--text-muted); padding: 0.5rem; background: rgba(255,255,255,0.02); border-radius: 6px; border: 1px dashed var(--panel-border); text-align: center;">
          No hay incidencias registradas para este colaborador en esta quincena.
        </div>
      `;
      return;
    }

    let rowsHtml = "";
    incidences.forEach(inc => {
      let details = [];
      if (inc.faltas > 0) details.push(`${inc.faltas} falta${inc.faltas > 1 ? 's' : ''}`);
      if (inc.vacaciones > 0) details.push(`${inc.vacaciones} vacación${inc.vacaciones > 1 ? 'es' : ''}`);
      if (inc.retardos > 0) details.push(`${inc.retardos} retardo${inc.retardos > 1 ? 's' : ''}`);
      
      const descVal = parseFloat(inc.descuento_adicional) || 0.0;
      if (descVal > 0) details.push(`Desc. adicional: ${formatCurrency(descVal)}`);
      
      // Dynamic deductions
      if (state.schema && state.schema.columns) {
        state.schema.columns.forEach(col => {
          if (col.category === "deduction" && col.incidence_editable && col.field !== "descuento_adicional") {
            const val = parseFloat(inc[col.field]) || 0.0;
            if (val > 0) {
              details.push(`${col.label || col.header}: ${formatCurrency(val)}`);
            }
          }
        });
      }

      const descText = details.join(", ") || "Observación / Justificación";
      const obs = inc.observaciones ? ` <span style="display:block; font-size:0.75rem; color:var(--text-muted); margin-top: 2px;">Obs: ${inc.observaciones}</span>` : "";

      rowsHtml += `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
          <td style="padding: 6px 4px; font-size:0.8rem; font-weight: 600; white-space: nowrap;">${inc.date}</td>
          <td style="padding: 6px 4px; font-size:0.8rem; line-height: 1.3;">
            <strong>${descText}</strong>
            ${obs}
          </td>
          <td style="padding: 6px 4px; text-align: right;">
            <button type="button" class="btn-delete-incidence" data-date="${inc.date}" style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 2px 6px;" title="Eliminar Incidencia">
              <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
            </button>
          </td>
        </tr>
      `;
    });

    historyContainer.innerHTML = `
      <h4 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 0.5rem; color: #fff;">Incidencias Registradas en la Quincena</h4>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 1px solid var(--panel-border); text-align: left;">
            <th style="padding: 4px; font-size: 0.75rem; color: var(--text-muted); width: 25%;">Fecha</th>
            <th style="padding: 4px; font-size: 0.75rem; color: var(--text-muted); width: 60%;">Detalle</th>
            <th style="padding: 4px; text-align: right; font-size: 0.75rem; color: var(--text-muted); width: 15%;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;

    if (window.lucide) lucide.createIcons();

    // Register delete click listeners
    historyContainer.querySelectorAll(".btn-delete-incidence").forEach(btn => {
      btn.addEventListener("click", () => {
        const date = btn.getAttribute("data-date");
        if (confirm(`¿Estás seguro de que deseas eliminar la incidencia del día ${date}?`)) {
          deleteIncidence(state.selectedIncidenceEmployeeId, date);
        }
      });
    });
  }

  function deleteIncidence(employeeId, date) {
    fetch(`/api/incidences?employee_id=${encodeURIComponent(employeeId)}&date=${encodeURIComponent(date)}`, {
      method: "DELETE",
      headers: {
        "Authorization": "Bearer " + (localStorage.getItem("rhm_session_token") || "")
      }
    })
      .then(res => {
        if (!res.ok) {
          return res.json().then(d => { throw new Error(d.error || "Error al eliminar incidencia"); });
        }
        return res.json();
      })
      .then(resData => {
        showToast("Incidencia eliminada con éxito.");
        loadState().then(() => {
          loadIncidencesForSelectedEmployee(state.selectedIncidenceEmployeeId);
        });
      })
      .catch(err => {
        console.error("Delete incidence failed:", err);
        showToast(err.message, "error");
      });
  }

  function applyIncidenceValuesForSelectedDate() {
    const dateInput = document.getElementById("inc-fecha");
    if (!dateInput) return;
    const selectedDate = dateInput.value;
    
    // Find incidence for this date
    const inc = (state.currentEmployeeIncidences || []).find(i => i.date === selectedDate);
    
    if (inc) {
      document.getElementById("inc-faltas").value = inc.faltas || 0;
      document.getElementById("inc-retardos").value = inc.retardos || 0;
      document.getElementById("inc-vacaciones").value = inc.vacaciones || 0;
      document.getElementById("inc-observaciones").value = inc.observaciones || "";
      
      const pSel = document.getElementById("inc-puntualidad");
      if (pSel) pSel.value = inc.puntualidad || "SI";
      
      const aSel = document.getElementById("inc-asistencia");
      if (aSel) aSel.value = inc.asistencia || "SI";
      
      // Dynamic deductions
      if (state.schema && state.schema.columns) {
        state.schema.columns.forEach(col => {
          if (col.category === "deduction" && col.incidence_editable) {
            const el = document.getElementById(`inc-${col.field}`);
            if (el) {
              el.value = inc[col.field] || 0.0;
            }
          }
        });
      }
    } else {
      // Reset values
      document.getElementById("inc-faltas").value = 0;
      document.getElementById("inc-retardos").value = 0;
      document.getElementById("inc-vacaciones").value = 0;
      document.getElementById("inc-observaciones").value = "";
      
      const pSel = document.getElementById("inc-puntualidad");
      if (pSel) pSel.value = "SI";
      
      const aSel = document.getElementById("inc-asistencia");
      if (aSel) aSel.value = "SI";
      
      // Dynamic deductions
      if (state.schema && state.schema.columns) {
        state.schema.columns.forEach(col => {
          if (col.category === "deduction" && col.incidence_editable) {
            const el = document.getElementById(`inc-${col.field}`);
            if (el) {
              el.value = 0.0;
            }
          }
        });
      }
    }
  }

  const formIncidence = document.getElementById("form-capture-incidence");
  if (formIncidence) {
    formIncidence.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!state.selectedIncidenceEmployeeId) return;

      const faltas = parseInt(document.getElementById("inc-faltas").value) || 0;
      const retardos = parseInt(document.getElementById("inc-retardos").value) || 0;
      const vacaciones = parseInt(document.getElementById("inc-vacaciones").value) || 0;
      const observaciones = document.getElementById("inc-observaciones").value.trim();
      const puntualidad = document.getElementById("inc-puntualidad") ? document.getElementById("inc-puntualidad").value : "SI";
      const asistencia = document.getElementById("inc-asistencia") ? document.getElementById("inc-asistencia").value : "SI";

      const dateVal = document.getElementById("inc-fecha") ? document.getElementById("inc-fecha").value : "";
      const payload = {
        id: state.selectedIncidenceEmployeeId,
        date: dateVal,
        faltas,
        retardos,
        vacaciones,
        observaciones,
        puntualidad,
        asistencia
      };

      // Gather dynamic deductions
      if (state.schema && state.schema.columns) {
        state.schema.columns.forEach(col => {
          if (col.category === "deduction" && col.incidence_editable) {
            const el = document.getElementById(`inc-${col.field}`);
            payload[col.field] = el ? parseFloat(el.value) || 0.0 : 0.0;
          }
        });
      }

      // Backward compatibility mapping for main descuento
      payload.descuento_adicional = payload.descuento_adicional || 0.0;

      fetch("/api/incidences", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": "Bearer " + (localStorage.getItem("rhm_session_token") || "")
        },
        body: JSON.stringify(payload)
      })
        .then(res => res.json())
        .then(resData => {
          if (resData.error) {
            showToast(resData.error, "error");
            return;
          }
          showToast("Incidencias guardadas en Excel con éxito.");
          loadState().then(() => {
            if (state.selectedIncidenceEmployeeId) {
              loadIncidencesForSelectedEmployee(state.selectedIncidenceEmployeeId);
            }
          });
        })
        .catch(err => {
          console.error("Error guardando incidencias:", err);
          showToast("Error al guardar incidencias en Excel. Verifica que el archivo no esté abierto.", "error");
        });
    });
  }

  const incFechaInput = document.getElementById("inc-fecha");
  if (incFechaInput) {
    incFechaInput.addEventListener("change", () => {
      applyIncidenceValuesForSelectedDate();
    });
  }

  // 11. View Rendering - PRE-PAYROLL (DYNAMIC EXCEL SHEET VIEW)
  function renderPrenomina() {
    const tbody = document.getElementById("prenomina-table-body");
    if (!tbody || !state.schema) return;
    tbody.innerHTML = "";

    const cols = state.schema.columns;
    const nominalFields = [
      "salario_diario",
      "factor_integracion",
      "sdi",
      "sueldo_nominal",
      "puntualidad",
      "asistencia",
      "vales_despensa",
      "fondo_ahorro",
      "percepcion_sueldos"
    ];
    const nominalCols = cols.filter(c => nominalFields.includes(c.field));
    const otherCols = cols.filter(c => c.category === "others");

    // Dynamic colspan update in main layout header
    const mainNominalHeader = document.getElementById("header-nominal-colspan");
    if (mainNominalHeader) mainNominalHeader.colSpan = nominalCols.length;
    
    const mainOthersHeader = document.getElementById("header-otros-colspan");
    if (mainOthersHeader) mainOthersHeader.colSpan = otherCols.length + 1; // including calculated Total Otros column

    // Redraw subheaders row dynamically
    const subheaderRow = document.getElementById("prenomina-subheaders-row");
    if (subheaderRow) {
      subheaderRow.innerHTML = "";
      nominalCols.forEach(c => { subheaderRow.innerHTML += `<th>${c.header || c.label}</th>`; });
      otherCols.forEach(c => { subheaderRow.innerHTML += `<th>${c.header || c.label}</th>`; });
      subheaderRow.innerHTML += `<th>Total Otros</th>`;
    }

    const totals = {
      sueldoNominal: 0,
      percepcionSueldos: 0,
      totalOtros: 0,
      brutoMensual: 0,
      brutoQuincenal: 0,
      descuentoFaltas: 0,
      descuentoAdicional: 0,
      netoQuincenal: 0
    };

    // Initialize all dynamic totals
    nominalCols.forEach(c => totals[c.field] = 0);
    otherCols.forEach(c => totals[c.field] = 0);

    let idx = 1;
    state.employees.forEach(emp => {
      const calc = calculateEmployeePayroll(emp, state.config);
      
      if (!calc.isBaja) {
        totals.percepcionSueldos += calc.percepcionSueldos;
        totals.totalOtros += calc.totalOtros;
        totals.brutoMensual += calc.sueldoBrutoMensual;
        totals.brutoQuincenal += calc.sueldoBrutoQuincenalNormal;
        totals.descuentoFaltas += calc.descuentoFaltas;
        totals.descuentoAdicional += calc.descuentoAdicional;
        totals.netoQuincenal += calc.sueldoNetoQuincenal;

        nominalCols.forEach(c => {
          const val = calc[c.field] !== undefined ? calc[c.field] : emp[c.field];
          totals[c.field] += val || 0;
        });

        otherCols.forEach(c => {
          totals[c.field] += emp[c.field] || 0;
        });
      }

      const rowClass = calc.isBaja ? 'style="opacity: 0.4;"' : '';
      const faLabel = calc.isBaja ? '-' : (emp.fondo_ahorro_activo ? 'SI' : 'NO');
      
      let rowHtml = `
        <tr ${rowClass}>
          <td class="align-center">${calc.isBaja ? '-' : idx}</td>
          <td class="align-center" style="font-family:monospace; font-weight:600;">${emp.id}</td>
          <td class="align-center">${emp.empresa || '-'}</td>
          <td class="align-left" style="font-weight: 500;">
            ${emp.nombre || '-'}
            ${calc.isBaja ? '<span class="badge danger" style="font-size:0.55rem; padding:0.05rem 0.25rem; margin-left:0.25rem;">Baja</span>' : ''}
          </td>
          <td class="align-center">${emp.ingreso || '-'}</td>
          <td class="align-center">${calc.antiguedad.toFixed(1)}</td>
          <td class="align-center">${faLabel}</td>
      `;

      // Render Nominal columns
      nominalCols.forEach(c => {
        const val = calc[c.field] !== undefined ? calc[c.field] : emp[c.field];
        let formatted = '-';
        let cellClass = '';
        if (val > 0) {
          formatted = c.field === 'factor_integracion' ? val.toFixed(4) : formatNumber(val);
        } else if (val === 0 && emp.salario_diario > 0 && (c.field === 'puntualidad' || c.field === 'asistencia')) {
          formatted = '0.00';
          cellClass = 'class="overridden-cell"';
        }
        rowHtml += `<td ${cellClass}>${formatted}</td>`;
      });

      // Render Others columns
      otherCols.forEach(c => {
        const val = emp[c.field] || 0.0;
        rowHtml += `<td>${val > 0 ? formatNumber(val) : '-'}</td>`;
      });

      // Total otros
      rowHtml += `<td style="font-weight: 600;">${calc.totalOtros > 0 ? formatNumber(calc.totalOtros) : '-'}</td>`;

      // Render sueldos y ajustes row totals
      rowHtml += `
          <td style="font-weight: 600;">${calc.sueldoBrutoMensual > 0 ? formatNumber(calc.sueldoBrutoMensual) : '-'}</td>
          <td>${calc.sueldoBrutoQuincenalNormal > 0 ? formatNumber(calc.sueldoBrutoQuincenalNormal) : '-'}</td>
          <td class="${calc.descuentoFaltas > 0 ? 'overridden-cell' : ''}">${calc.descuentoFaltas > 0 ? formatNumber(calc.descuentoFaltas) : '-'}</td>
          <td class="${calc.descuentoAdicional > 0 ? 'overridden-cell' : ''}">${calc.descuentoAdicional > 0 ? formatNumber(calc.descuentoAdicional) : '-'}</td>
          <td style="font-weight: 700; color: #fff; background: rgba(99,102,241,0.05);">${calc.sueldoNetoQuincenal > 0 ? formatNumber(calc.sueldoNetoQuincenal) : '-'}</td>
          <td class="align-left" style="font-size:0.75rem; color: var(--text-muted); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${emp.observaciones || ''}">${emp.observaciones || '-'}</td>
        </tr>
      `;

      tbody.innerHTML += rowHtml;
      if (!calc.isBaja) idx++;
    });

    // Render general sum row
    let sumRowHtml = `
      <tr class="total-row">
        <td colspan="7" class="align-left">TOTALES / SUMAS GENERALES</td>
    `;

    nominalCols.forEach(c => {
      const tVal = totals[c.field];
      sumRowHtml += `<td>${tVal > 0 && c.field !== 'factor_integracion' ? formatNumber(tVal) : '-'}</td>`;
    });

    otherCols.forEach(c => {
      const tVal = totals[c.field];
      sumRowHtml += `<td>${tVal > 0 ? formatNumber(tVal) : '-'}</td>`;
    });

    sumRowHtml += `
      <td>${formatNumber(totals.totalOtros)}</td>
      <td>${formatNumber(totals.brutoMensual)}</td>
      <td>${formatNumber(totals.brutoQuincenal)}</td>
      <td>${formatNumber(totals.descuentoFaltas)}</td>
      <td>${formatNumber(totals.descuentoAdicional)}</td>
      <td>${formatNumber(totals.netoQuincenal)}</td>
      <td>-</td>
    </tr>
    `;

    tbody.innerHTML += sumRowHtml;

    // Register click listeners on the rendered rows
    const rows = tbody.querySelectorAll("tr:not(.total-row)");
    rows.forEach(row => {
      // Highlight row if it is the currently selected employee
      const idCell = row.querySelector("td:nth-child(2)");
      if (idCell) {
        const empId = idCell.textContent.trim();
        if (empId === currentAIEmployeeId) {
          row.classList.add("selected-row");
        }
      }
      
      row.addEventListener("click", () => {
        const idCell = row.querySelector("td:nth-child(2)");
        if (!idCell) return;
        const empId = idCell.textContent.trim();
        selectEmployeeForAI(empId, row);
      });
    });
  }

  // 12. View Rendering - CONFIGURATION
  const toggleApiKeyBtn = document.getElementById("toggle-api-key");
  if (toggleApiKeyBtn) {
    toggleApiKeyBtn.addEventListener("click", () => {
      const input = document.getElementById("cfg-ai-key");
      const icon = toggleApiKeyBtn.querySelector("i");
      if (input.type === "password") {
        input.type = "text";
        icon.setAttribute("data-lucide", "eye-off");
      } else {
        input.type = "password";
        icon.setAttribute("data-lucide", "eye");
      }
      if (window.lucide) lucide.createIcons();
    });
  }

  const aiProviderSelect = document.getElementById("cfg-ai-provider");
  if (aiProviderSelect) {
    aiProviderSelect.addEventListener("change", (e) => {
      const provider = e.target.value;
      toggleAIProviderModels(provider);
      
      const modelSelect = document.getElementById("cfg-ai-model-select");
      if (modelSelect) {
        if (provider === "openrouter") {
          modelSelect.value = "google/gemini-2.0-flash-exp:free";
        } else {
          modelSelect.value = "gemini-2.0-flash";
        }
        modelSelect.dispatchEvent(new Event("change"));
      }
    });
  }

  const aiModelSelect = document.getElementById("cfg-ai-model-select");
  if (aiModelSelect) {
    aiModelSelect.addEventListener("change", (e) => {
      const customGroup = document.getElementById("cfg-ai-model-custom-group");
      if (customGroup) {
        customGroup.style.display = e.target.value === "custom" ? "flex" : "none";
      }
    });
  }

  const formConfig = document.getElementById("form-config");
  if (formConfig) {
    formConfig.addEventListener("submit", (e) => {
      e.preventDefault();
      const db_path = document.getElementById("cfg-db-path").value.trim();
      const uma = parseFloat(document.getElementById("cfg-uma").value) || 117.31;
      const vales_pct = parseFloat(document.getElementById("cfg-vales-pct").value) || 40;
      const dias_mes = parseFloat(document.getElementById("cfg-dias-mes").value) || 30.4;
      const fa_pct = parseFloat(document.getElementById("cfg-fa-pct").value) || 11;
      const aguinaldo = parseFloat(document.getElementById("cfg-aguinaldo").value) || 15;
      const prima = parseFloat(document.getElementById("cfg-prima").value) || 25;
      
      const ai_provider = document.getElementById("cfg-ai-provider") ? document.getElementById("cfg-ai-provider").value : "google";
      const modelSelectVal = document.getElementById("cfg-ai-model-select") ? document.getElementById("cfg-ai-model-select").value : "gemini-2.0-flash";
      const ai_model = modelSelectVal === "custom" 
        ? (document.getElementById("cfg-ai-model-custom") ? document.getElementById("cfg-ai-model-custom").value.trim() : "gemini-2.0-flash")
        : modelSelectVal;
      const api_key = document.getElementById("cfg-ai-key") ? document.getElementById("cfg-ai-key").value.trim() : "";
      const rules = document.getElementById("cfg-payroll-rules") ? document.getElementById("cfg-payroll-rules").value : "";
 
      if (db_path.toLowerCase().endsWith(".pages")) {
        showToast("Apple Pages (.pages) es un procesador de textos. Por favor, exporta el archivo a Excel (.xlsx) o CSV (.csv) para conectarlo como base de datos.", "error");
        return;
      }
      if (db_path.toLowerCase().endsWith(".numbers")) {
        showToast("Apple Numbers (.numbers) es un formato cerrado de Apple. Por favor, exporta el archivo a Excel (.xlsx) o CSV (.csv) para poder usarlo.", "error");
        return;
      }
 
      fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uma: uma,
          vales_pct: vales_pct,
          dias_mes: dias_mes,
          fa_pct: fa_pct,
          aguinaldo: aguinaldo,
          prima: prima,
          db_path: db_path,
          payroll_rules: rules,
          ai_provider: ai_provider,
          ai_model: ai_model
        })
      })
        .then(res => res.json())
        .then(resData => {
          if (resData.error) {
            showToast(resData.error, "error");
            return;
          }
          
          if (api_key) {
            fetch("/api/secrets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ai_api_key: api_key })
            })
              .then(sRes => sRes.json())
              .then(sData => {
                if (sData.error) {
                  showToast("Configuración guardada, pero hubo un error al guardar la clave API: " + sData.error, "warning");
                } else {
                  showToast("Configuración y clave API guardadas con éxito.");
                }
                loadState();
              })
              .catch(err => {
                console.error("Error saving API key:", err);
                showToast("Configuración guardada, pero falló al registrar la clave API.", "error");
                loadState();
              });
          } else {
            showToast("Configuración guardada con éxito.");
            loadState();
          }
        })
        .catch(err => {
          console.error("Error guardando config:", err);
          showToast("Error al escribir configuración. ¿Está abierto o bloqueado el archivo?", "error");
        });
    });
  }

  // 12b. File upload for payroll rules (via native OS dialog for Pywebview compatibility)
  const btnLoadRulesFile = document.getElementById("btn-load-rules-file");
  if (btnLoadRulesFile) {
    const rulesFileInput = document.createElement("input");
    rulesFileInput.type = "file";
    rulesFileInput.accept = ".docx,.txt";
    rulesFileInput.style.display = "none";
    document.body.appendChild(rulesFileInput);

    btnLoadRulesFile.addEventListener("click", () => {
      rulesFileInput.value = "";
      rulesFileInput.click();
    });

    rulesFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      showToast("Leyendo archivo de reglas...", "info");
      const formData = new FormData();
      formData.append("file", file);

      fetch("/api/upload-rules?_t=" + Date.now(), {
        method: "POST",
        body: formData
      })
        .then(res => {
          if (!res.ok) {
            return res.json().then(d => { throw new Error(d.error || "Error al leer archivo"); });
          }
          return res.json();
        })
        .then(data => {
          if (data.text) {
            const rulesTextArea = document.getElementById("cfg-payroll-rules");
            if (rulesTextArea) {
              rulesTextArea.value = data.text;
              showToast("Reglas de nómina cargadas con éxito.");
            }
          }
        })
        .catch(err => {
          console.error("Error al cargar reglas:", err);
          showToast(err.message || "Error al procesar el archivo de reglas.", "error");
        });
    });
  }



  const btnSelectDbPath = document.getElementById("btn-select-db-path");
  if (btnSelectDbPath) {
    const dbFileInput = document.createElement("input");
    dbFileInput.type = "file";
    dbFileInput.accept = ".xlsx,.csv";
    dbFileInput.style.display = "none";
    document.body.appendChild(dbFileInput);

    btnSelectDbPath.addEventListener("click", () => {
      dbFileInput.value = "";
      dbFileInput.click();
    });

    dbFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      showToast("Subiendo y procesando base de datos...", "info");
      const formData = new FormData();
      formData.append("file", file);

      fetch("/api/upload-database?_t=" + Date.now(), {
        method: "POST",
        body: formData
      })
        .then(res => {
          if (!res.ok) {
            return res.json().then(d => { throw new Error(d.error || "Error al subir archivo"); });
          }
          return res.json();
        })
        .then(data => {
          if (data.selected_path) {
            const dbPathInput = document.getElementById("cfg-db-path");
            if (dbPathInput) {
              dbPathInput.value = data.selected_path;
              
              const uma = parseFloat(document.getElementById("cfg-uma").value) || 117.31;
              const vales_pct = parseFloat(document.getElementById("cfg-vales-pct").value) || 40;
              const dias_mes = parseFloat(document.getElementById("cfg-dias-mes").value) || 30.4;
              const fa_pct = parseFloat(document.getElementById("cfg-fa-pct").value) || 11;
              const aguinaldo = parseFloat(document.getElementById("cfg-aguinaldo").value) || 15;
              const prima = parseFloat(document.getElementById("cfg-prima").value) || 25;
              
              const ai_provider = document.getElementById("cfg-ai-provider") ? document.getElementById("cfg-ai-provider").value : "google";
              const modelSelectVal = document.getElementById("cfg-ai-model-select") ? document.getElementById("cfg-ai-model-select").value : "gemini-2.0-flash";
              const ai_model = modelSelectVal === "custom" 
                ? (document.getElementById("cfg-ai-model-custom") ? document.getElementById("cfg-ai-model-custom").value.trim() : "gemini-2.0-flash")
                : modelSelectVal;
              const api_key = document.getElementById("cfg-ai-key") ? document.getElementById("cfg-ai-key").value.trim() : "";

              showToast("Guardando ruta de archivo y cargando datos...", "info");

              fetch("/api/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  uma: uma,
                  vales_pct: vales_pct,
                  dias_mes: dias_mes,
                  fa_pct: fa_pct,
                  aguinaldo: aguinaldo,
                  prima: prima,
                  db_path: data.selected_path,
                  ai_provider: ai_provider,
                  ai_model: ai_model
                })
              })
                .then(res => res.json())
                .then(resData => {
                  if (resData.error) {
                    showToast(resData.error, "error");
                    return;
                  }
                  
                  if (api_key) {
                    fetch("/api/secrets", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ ai_api_key: api_key })
                    })
                      .then(sRes => sRes.json())
                      .then(sData => {
                        showToast("Archivo '" + data.selected_path.split(/[/\\]/).pop() + "' conectado y configuración guardada con éxito.", "success");
                        loadState();
                      })
                      .catch(err => {
                        console.error("Error saving API key:", err);
                        showToast("Conectado con éxito, pero falló al registrar la clave API.", "warning");
                        loadState();
                      });
                  } else {
                    showToast("Archivo '" + data.selected_path.split(/[/\\]/).pop() + "' conectado y cargado con éxito.", "success");
                    loadState();
                  }
                })
                .catch(err => {
                  console.error("Error al guardar ruta seleccionada:", err);
                  showToast("Error al cargar la base de datos seleccionada.", "error");
                });
            }
          } else {
            showToast("Selección de archivo cancelada.", "info");
          }
        })
        .catch(err => {
          console.error("Error al subir archivo de base de datos:", err);
          showToast(err.message || "Error al subir el archivo.", "error");
        });
    });
  }

  function renderConfig() {
    const dbPathInput = document.getElementById("cfg-db-path");
    if (dbPathInput) {
      dbPathInput.value = state.db_path || "Nomina ciega.xlsx";
    }
    document.getElementById("cfg-uma").value = state.config.uma;
    document.getElementById("cfg-vales-pct").value = state.config.valesPct;
    document.getElementById("cfg-dias-mes").value = state.config.diasMes;
    document.getElementById("cfg-fa-pct").value = state.config.faPct;
    document.getElementById("cfg-aguinaldo").value = state.config.aguinaldo;
    document.getElementById("cfg-prima").value = state.config.prima;

    const rulesTextArea = document.getElementById("cfg-payroll-rules");
    if (rulesTextArea && state.schema) {
      rulesTextArea.value = state.schema.payroll_rules || "";
    }
  }

  // 13. Modal Handle: Alta / Edición Colaboradores
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

      // Fill other dynamic columns
      if (state.schema && state.schema.columns) {
        state.schema.columns.forEach(col => {
          if (col.category === "others" && col.editable) {
            const el = document.getElementById(`col-${col.field}`);
            if (el) {
              el.value = emp[col.field] || 0.0;
            }
          }
        });
      }
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

      if (state.schema && state.schema.columns) {
        state.schema.columns.forEach(col => {
          if (col.category === "others" && col.editable) {
            const el = document.getElementById(`col-${col.field}`);
            if (el) el.value = 0.0;
          }
        });
      }
    }
  }

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
        fondo_ahorro_activo: checkNominal.checked ? document.getElementById("col-fa-activo").checked : false,
        salario_diario: checkNominal.checked ? parseFloat(document.getElementById("col-salario-diario").value) || 0 : 0
      };

      // Gather other dynamic payments
      if (state.schema && state.schema.columns) {
        state.schema.columns.forEach(col => {
          if (col.category === "others" && col.editable) {
            const el = document.getElementById(`col-${col.field}`);
            data[col.field] = el ? parseFloat(el.value) || 0.0 : 0.0;
          }
        });
      }

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
          loadState();
        })
        .catch(err => {
          console.error("Error al guardar colaborador:", err);
          showToast("Error al escribir colaborador en Excel. Asegúrate de cerrar el archivo si lo tienes abierto.", "error");
        });
    });
  }

  // Toggle Status: Alta / Baja
  function toggleCollaboratorStatus(id) {
    const emp = state.employees.find(e => e.id === id);
    if (!emp) return;

    const isCurrentlyBaja = emp.baja !== null && emp.baja !== undefined && emp.baja !== "";
    const updatedBaja = isCurrentlyBaja ? null : new Date().toISOString().split("T")[0];
    
    const updatedData = { ...emp, baja: updatedBaja };

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





  const btnDownloadExcel = document.getElementById("btn-download-excel");
  if (btnDownloadExcel) {
    btnDownloadExcel.addEventListener("click", () => {
      const link = document.createElement("a");
      link.href = "/api/download-excel";
      link.download = "Nomina_ciega_respaldo.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("Descargando archivo Excel...");
    });
  }

  // 15. Theme Toggle Logic
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

  // 15B. AUTH & RBAC IMPLEMENTATION
  function applyRoleBasedUI() {
    const role = localStorage.getItem("rhm_user_role") || "capturista";
    const username = localStorage.getItem("rhm_username") || "Usuario";
    
    // Header user info
    const headerUserInfo = document.getElementById("header-user-info");
    if (headerUserInfo) {
      headerUserInfo.style.display = "flex";
    }

    // Role restrictions
    const configTabBtn = document.querySelector('.nav-links button[data-target="config"]');
    const downloadExcelBtn = document.getElementById("btn-download-excel");
    const addCollabBtn = document.getElementById("btn-add-collaborator");
    const userMgmtBox = document.getElementById("user-management-box");

    if (role === "capturista") {
      if (configTabBtn) configTabBtn.style.display = "none";
      if (downloadExcelBtn) downloadExcelBtn.style.display = "none";
      if (addCollabBtn) addCollabBtn.style.display = "none";
      if (userMgmtBox) userMgmtBox.style.display = "none";
      
      // If currently on config tab, switch to dashboard
      if (state.activeTab === "config") {
        switchTab("dashboard");
      }
    } else {
      if (configTabBtn) configTabBtn.style.display = "inline-flex";
      if (downloadExcelBtn) downloadExcelBtn.style.display = "inline-flex";
      if (addCollabBtn) addCollabBtn.style.display = "inline-flex";
      if (userMgmtBox) {
        userMgmtBox.style.display = "block";
        loadUsers();
      }
    }
  }

  function switchTab(targetTab) {
    const navItem = document.querySelector(`.nav-item[data-target="${targetTab}"]`);
    if (navItem) {
      navItem.click();
    }
  }

  // Login form handler
  const formLogin = document.getElementById("form-login");
  if (formLogin) {
    formLogin.addEventListener("submit", (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById("login-username");
      const passwordInput = document.getElementById("login-password");
      
      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      
      fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      })
      .then(res => {
        if (!res.ok) {
          throw new Error("Usuario o contraseña incorrectos");
        }
        return res.json();
      })
      .then(data => {
        localStorage.setItem("rhm_session_token", data.token);
        localStorage.setItem("rhm_user_role", data.role);
        localStorage.setItem("rhm_username", data.username);
        
        usernameInput.value = "";
        passwordInput.value = "";
        
        hideLoginScreen();
        applyRoleBasedUI();
        loadState();
        showToast(`Sesión iniciada como ${data.username}`);
      })
      .catch(err => {
        console.error("Login failed:", err);
        showToast(err.message, "error");
      });
    });
  }

  // Logout button handler
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      fetch("/api/logout", { method: "POST" })
      .finally(() => {
        localStorage.removeItem("rhm_session_token");
        localStorage.removeItem("rhm_user_role");
        localStorage.removeItem("rhm_username");
        
        const headerUserInfo = document.getElementById("header-user-info");
        if (headerUserInfo) headerUserInfo.style.display = "none";
        
        showLoginScreen();
        showToast("Sesión cerrada");
      });
    });
  }



  // Create user form handler
  const formCreateUser = document.getElementById("form-create-user");
  if (formCreateUser) {
    formCreateUser.addEventListener("submit", (e) => {
      e.preventDefault();
      const newUsernameInput = document.getElementById("new-username");
      const newPasswordInput = document.getElementById("new-password");
      const newRoleSelect = document.getElementById("new-role");
      
      const username = newUsernameInput.value.trim();
      const password = newPasswordInput.value;
      const role = newRoleSelect.value;
      
      fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role })
      })
      .then(res => {
        if (!res.ok) {
          return res.json().then(d => { throw new Error(d.error || "Error guardando usuario"); });
        }
        return res.json();
      })
      .then(() => {
        newUsernameInput.value = "";
        newPasswordInput.value = "";
        showToast("Usuario guardado con éxito");
        loadUsers();
      })
      .catch(err => {
        console.error("Create user failed:", err);
        showToast(err.message, "error");
      });
    });
  }

  function loadUsers() {
    const listTable = document.getElementById("users-list-table");
    if (!listTable) return;
    
    fetch("/api/users")
    .then(res => {
      if (!res.ok) throw new Error("Error cargando usuarios");
      return res.json();
    })
    .then(users => {
      listTable.innerHTML = "";
      if (users.length === 0) {
        listTable.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">No hay usuarios registrados</td></tr>`;
        return;
      }
      
      users.forEach(u => {
        const tr = document.createElement("tr");
        const isSelf = u.username === localStorage.getItem("rhm_username");
        
        tr.innerHTML = `
          <td><strong>${u.username}</strong> ${isSelf ? '<span class="badge info" style="font-size: 0.7rem; padding: 2px 6px; margin-left: 5px;">Tú</span>' : ''}</td>
          <td><span class="badge ${u.role === 'admin' ? 'success' : 'secondary'}">${u.role === 'admin' ? 'Administrador' : 'Capturista'}</span></td>
          <td style="text-align: center;">
            ${isSelf ? '-' : `
              <button class="btn btn-sm btn-logout delete-user-btn" data-username="${u.username}" style="color: var(--danger); background: transparent; border: none; cursor: pointer; padding: 4px;" title="Eliminar usuario">
                <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
              </button>
            `}
          </td>
        `;
        listTable.appendChild(tr);
      });
      
      if (window.lucide) lucide.createIcons();
      
      listTable.querySelectorAll(".delete-user-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const username = btn.getAttribute("data-username");
          if (confirm(`¿Estás seguro de que deseas eliminar al usuario "${username}"?`)) {
            fetch(`/api/users?username=${encodeURIComponent(username)}`, { method: "DELETE" })
            .then(res => {
              if (!res.ok) {
                return res.json().then(d => { throw new Error(d.error || "Error al eliminar usuario"); });
              }
              return res.json();
            })
            .then(() => {
              showToast(`Usuario "${username}" eliminado`);
              loadUsers();
            })
            .catch(err => {
              console.error("Delete user failed:", err);
              showToast(err.message, "error");
            });
          }
        });
      });
    })
    .catch(err => {
      console.error("Load users failed:", err);
    });
  }

  // 16. Formatter helpers
  function formatCurrency(val) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);
  }

  function formatNumber(val) {
    return new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  }

  // 17. Initialize Application
  const sessionToken = localStorage.getItem("rhm_session_token");
  if (!sessionToken) {
    showLoginScreen();
  } else {
    hideLoginScreen();
    applyRoleBasedUI();
    loadState();
  }

  // 18. AI Explainer Sidebar Integration
  let currentAIEmployeeId = null;
  let aiChatHistory = [];

  const closeSidebarBtn = document.getElementById("btn-close-ai-sidebar");
  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener("click", closeAISidebar);
  }

  const aiChatInputElement = document.getElementById("ai-chat-input");
  const aiChatSendBtn = document.getElementById("btn-ai-chat-send");
  if (aiChatSendBtn && aiChatInputElement) {
    aiChatSendBtn.addEventListener("click", sendAIChatMessage);
    aiChatInputElement.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        sendAIChatMessage();
      }
    });
  }

  function selectEmployeeForAI(empId, rowElement) {
    // If already selected, do nothing
    if (currentAIEmployeeId === empId) return;

    // Highlight row
    const tbody = document.getElementById("prenomina-table-body");
    if (tbody) {
      tbody.querySelectorAll("tr").forEach(tr => tr.classList.remove("selected-row"));
    }
    if (rowElement) {
      rowElement.classList.add("selected-row");
    }

    currentAIEmployeeId = empId;
    aiChatHistory = []; // Reset history

    const sidebar = document.getElementById("prenomina-ai-sidebar");
    const nameDiv = document.getElementById("ai-collab-name");
    const detailsDiv = document.getElementById("ai-collab-details");
    const messagesDiv = document.getElementById("ai-chat-messages");
    const chatInput = document.getElementById("ai-chat-input");
    const chatSendBtn = document.getElementById("btn-ai-chat-send");
    const badge = document.getElementById("ai-rules-badge");

    if (sidebar) sidebar.classList.add("active");

    const emp = state.employees.find(e => e.id === empId);
    if (emp) {
      if (nameDiv) nameDiv.textContent = emp.nombre || "Colaborador sin Nombre";
      if (detailsDiv) detailsDiv.textContent = `Cód: ${emp.id} | Ingreso: ${emp.ingreso || '-'} | SD: $${formatNumber(emp.salario_diario)}`;
    } else {
      if (nameDiv) nameDiv.textContent = `Colaborador ${empId}`;
      if (detailsDiv) detailsDiv.textContent = `Cód: ${empId}`;
    }

    if (messagesDiv) {
      messagesDiv.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 10px; padding: 2rem;">
          <div class="ai-typing-indicator">
            <div class="ai-typing-dot"></div>
            <div class="ai-typing-dot"></div>
            <div class="ai-typing-dot"></div>
          </div>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">Analizando datos del colaborador y generando desglose...</p>
        </div>
      `;
    }

    if (chatInput) {
      chatInput.disabled = true;
      chatInput.value = "";
    }
    if (chatSendBtn) chatSendBtn.disabled = true;

    // Load initial explanation
    fetch("/api/payroll/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employee_id: empId,
        chat_history: [],
        new_message: ""
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          if (messagesDiv) {
            messagesDiv.innerHTML = `<div class="chat-message assistant" style="color: var(--danger);"><p>Error: ${data.error}</p></div>`;
          }
          return;
        }

        // Set rules badge
        if (badge) {
          if (data.offline) {
            badge.textContent = "Offline / Local";
            badge.className = "badge rules-badge-offline";
          } else if (data.rules_source === "custom") {
            badge.textContent = "Reglas Empresa";
            badge.className = "badge rules-badge-custom";
          } else {
            badge.textContent = "Reglas Oficiales LFT";
            badge.className = "badge rules-badge-official";
          }
        }

        if (messagesDiv) {
          messagesDiv.innerHTML = "";
        }
        appendAssistantMessage(data.response);

        if (chatInput) chatInput.disabled = false;
        if (chatSendBtn) chatSendBtn.disabled = false;
        if (chatInput) chatInput.focus();
        
        if (window.lucide) lucide.createIcons();
      })
      .catch(err => {
        console.error("Error fetching explanation:", err);
        if (messagesDiv) {
          messagesDiv.innerHTML = `<div class="chat-message assistant" style="color: var(--danger);"><p>Error de conexión al obtener la explicación.</p></div>`;
        }
      });
  }

  function appendAssistantMessage(text) {
    const messagesDiv = document.getElementById("ai-chat-messages");
    if (!messagesDiv) return;
    
    const formatted = formatMarkdown(text);
    const msgElement = document.createElement("div");
    msgElement.className = "chat-message assistant";
    msgElement.innerHTML = formatted;
    messagesDiv.appendChild(msgElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    aiChatHistory.push({ role: "model", text: text });
  }

  function appendUserMessage(text) {
    const messagesDiv = document.getElementById("ai-chat-messages");
    if (!messagesDiv) return;
    
    const msgElement = document.createElement("div");
    msgElement.className = "chat-message user";
    msgElement.innerHTML = `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
    messagesDiv.appendChild(msgElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    aiChatHistory.push({ role: "user", text: text });
  }

  function sendAIChatMessage() {
    const chatInput = document.getElementById("ai-chat-input");
    const messagesDiv = document.getElementById("ai-chat-messages");
    const chatSendBtn = document.getElementById("btn-ai-chat-send");
    
    if (!chatInput) return;
    const msgText = chatInput.value.trim();

    if (!msgText || !currentAIEmployeeId) return;

    appendUserMessage(msgText);
    chatInput.value = "";
    
    chatInput.disabled = true;
    if (chatSendBtn) chatSendBtn.disabled = true;
    
    const loadingIndicator = document.createElement("div");
    loadingIndicator.id = "ai-typing-loader";
    loadingIndicator.className = "chat-message assistant";
    loadingIndicator.innerHTML = `
      <div class="ai-typing-indicator">
        <div class="ai-typing-dot"></div>
        <div class="ai-typing-dot"></div>
        <div class="ai-typing-dot"></div>
      </div>
    `;
    if (messagesDiv) {
      messagesDiv.appendChild(loadingIndicator);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    fetch("/api/payroll/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employee_id: currentAIEmployeeId,
        chat_history: aiChatHistory.slice(0, -1), // Everything except user newly appended message to avoid duplication in history mapping
        new_message: msgText
      })
    })
      .then(res => res.json())
      .then(data => {
        const loader = document.getElementById("ai-typing-loader");
        if (loader) loader.remove();

        if (data.error) {
          if (messagesDiv) {
            messagesDiv.innerHTML += `<div class="chat-message assistant" style="color: var(--danger);"><p>Error: ${data.error}</p></div>`;
          }
          return;
        }

        appendAssistantMessage(data.response);

        if (data.applied_changes) {
          showToast("Se aplicaron las incidencias solicitadas a través de la IA.", "success");
          state.selectedIncidenceEmployeeId = currentAIEmployeeId;
          loadState().then(() => {
            selectIncidenceEmployee(currentAIEmployeeId);
          });
        }
        
        chatInput.disabled = false;
        if (chatSendBtn) chatSendBtn.disabled = false;
        chatInput.focus();
        
        if (window.lucide) lucide.createIcons();
      })
      .catch(err => {
        console.error("Error sending chat query:", err);
        const loader = document.getElementById("ai-typing-loader");
        if (loader) loader.remove();
        if (messagesDiv) {
          messagesDiv.innerHTML += `<div class="chat-message assistant" style="color: var(--danger);"><p>Error de conexión al enviar tu pregunta.</p></div>`;
        }
        chatInput.disabled = false;
        if (chatSendBtn) chatSendBtn.disabled = false;
      });
  }

  function closeAISidebar() {
    currentAIEmployeeId = null;
    aiChatHistory = [];
    
    const tbody = document.getElementById("prenomina-table-body");
    if (tbody) {
      tbody.querySelectorAll("tr").forEach(tr => tr.classList.remove("selected-row"));
    }

    const sidebar = document.getElementById("prenomina-ai-sidebar");
    if (sidebar) sidebar.classList.remove("active");

    const nameDiv = document.getElementById("ai-collab-name");
    const detailsDiv = document.getElementById("ai-collab-details");
    const messagesDiv = document.getElementById("ai-chat-messages");
    if (nameDiv) nameDiv.textContent = "Selecciona un colaborador";
    if (detailsDiv) detailsDiv.textContent = "Haz clic en una fila para ver el desglose";
    if (messagesDiv) {
      messagesDiv.innerHTML = `
        <div class="ai-chat-placeholder">
          <i data-lucide="message-square" style="width: 32px; height: 32px; margin-bottom: 8px; color: var(--text-muted); opacity: 0.5;"></i>
          <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">Haz clic en cualquier colaborador de la tabla de la izquierda para ver la explicación matemática detallada de su nómina.</p>
        </div>
      `;
    }
    
    if (aiChatInputElement) {
      aiChatInputElement.disabled = true;
      aiChatInputElement.value = "";
    }
    if (aiChatSendBtn) aiChatSendBtn.disabled = true;
    
    if (window.lucide) lucide.createIcons();
  }

  function formatMarkdown(text) {
    if (!text) return "";
    
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    html = parseMarkdownTables(html);

    html = html.replace(/^### (.*?)$/gm, '<h4 style="margin: 10px 0 5px 0; font-size: 0.95rem; font-weight: 600; color: #fff;">$1</h4>');
    html = html.replace(/^#### (.*?)$/gm, '<h5 style="margin: 8px 0 4px 0; font-size: 0.88rem; font-weight: 600; color: #fff;">$1</h5>');
    
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    let inList = false;
    const lines = html.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("- ") || line.startsWith("* ")) {
        const content = line.substring(2);
        if (!inList) {
          lines[i] = '<ul style="margin: 5px 0; padding-left: 15px; list-style-type: disc;">\n<li style="margin-bottom: 3px;">' + content + '</li>';
          inList = true;
        } else {
          lines[i] = '<li style="margin-bottom: 3px;">' + content + '</li>';
        }
      } else {
        if (inList) {
          lines[i] = '</ul>\n' + (line ? '<p style="margin: 0 0 8px 0;">' + line + '</p>' : '');
          inList = false;
        } else if (line) {
          if (line.startsWith("<h4") || line.startsWith("<h5") || line.startsWith("<table") || line.startsWith("<thead") || line.startsWith("<tbody") || line.startsWith("<tr") || line.startsWith("<th") || line.startsWith("<td") || line.startsWith("</table>") || line.startsWith("$$\n") || line.startsWith("$$") || line.startsWith("<div") || line.startsWith("</div") || line.startsWith("<hr")) {
            lines[i] = line;
          } else {
            lines[i] = '<p style="margin: 0 0 8px 0;">' + line + '</p>';
          }
        }
      }
    }
    if (inList) {
      lines.push('</ul>');
    }
    html = lines.join("\n");

    html = html.replace(/\$\$\n*([\s\S]*?)\n*\$\$/g, '<div style="background: rgba(255,255,255,0.02); border: 1px dashed var(--panel-border); padding: 8px; border-radius: 8px; font-family: monospace; text-align: center; margin: 8px 0; color: var(--secondary); font-size: 0.85rem;">$1</div>');
    html = html.replace(/`([^`\n]+)`/g, '<code style="font-family: monospace; background: rgba(255,255,255,0.04); padding: 1px 4px; border-radius: 4px; color: var(--secondary); font-size: 0.8rem;">$1</code>');
    html = html.replace(/^---$/gm, '<hr style="border: 0; border-top: 1px solid var(--panel-border); margin: 12px 0;">');

    return html;
  }

  function parseMarkdownTables(text) {
    const lines = text.split("\n");
    let inTable = false;
    let tableHtml = "";
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("|") && line.endsWith("|")) {
        const cells = line.split("|").slice(1, -1).map(c => c.trim());
        if (!inTable) {
          inTable = true;
          tableHtml = '<table style="width:100%; border-collapse:collapse; margin:10px 0; font-size:0.75rem;">\n';
          tableHtml += '<thead>\n<tr>\n' + cells.map(c => `<th style="padding:6px; border:1px solid var(--panel-border); background:rgba(255,255,255,0.05); text-align:left; font-weight: 600;">${c}</th>`).join("\n") + '\n</tr>\n</thead>\n<tbody>\n';
          lines[i] = "";
        } else {
          if (cells.every(c => /^:-*:?$/.test(c) || c === "" || c.startsWith("-"))) {
            lines[i] = "";
          } else {
            tableHtml += '<tr>\n' + cells.map(c => `<td style="padding:6px; border:1px solid var(--panel-border); text-align:left;">${c}</td>`).join("\n") + '\n</tr>\n';
            lines[i] = "";
          }
        }
      } else {
        if (inTable) {
          tableHtml += '</tbody>\n</table>\n';
          lines[i] = tableHtml + "\n" + lines[i];
          inTable = false;
        }
      }
    }
    if (inTable) {
      tableHtml += '</tbody>\n</table>\n';
      lines.push(tableHtml);
    }
    return lines.filter(l => l !== "").join("\n");
  }

  function getPeriodDefaultDate(periodStr) {
    if (!periodStr) return new Date().toISOString().split("T")[0];
    const match = periodStr.match(/(\d+)\s+al\s+(\d+)\s+(\w+)\s+(\d{4})/i);
    if (match) {
      const dayStart = parseInt(match[1]);
      const monthStr = match[3].toLowerCase().substring(0, 3);
      const year = parseInt(match[4]);
      
      const months = {
        ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
        jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11
      };
      const month = months[monthStr] !== undefined ? months[monthStr] : 3;
      
      // Default to start date of the period
      const d = new Date(year, month, dayStart);
      // Offset timezone to avoid UTC shifts
      const tzOffset = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - tzOffset).toISOString().split("T")[0];
    }
    return new Date().toISOString().split("T")[0];
  }

  const periodSelect = document.getElementById("period-select");
  if (periodSelect) {
    periodSelect.addEventListener("change", (e) => {
      const newPeriod = e.target.value;
      fetch("/api/period", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + (localStorage.getItem("rhm_session_token") || "")
        },
        body: JSON.stringify({ period: newPeriod })
      })
        .then(res => res.json())
        .then(resData => {
          if (resData.error) {
            showToast(resData.error, "error");
            return;
          }
          showToast(`Periodo cambiado a: ${newPeriod}`);
          loadState();
        })
        .catch(err => {
          console.error("Error cambiando periodo:", err);
          showToast("Error al actualizar el periodo.", "error");
        });
    });
  }

});
