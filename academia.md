---
layout: default
title: Academia
---

<div id="treino-selector">
  <h1>Treino de Hoje</h1>
  <p style="color: var(--text-muted, #64748b); margin-bottom: 1.5rem;">Qual série você vai fazer?</p>
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; max-width: 400px;">
    <button class="treino-btn" onclick="carregarTreino('A')">
      <span style="font-size: 2rem; font-weight: 700;">A</span>
      <span style="font-size: 0.8rem; color: var(--text-muted, #64748b);">Upper A</span>
    </button>
    <button class="treino-btn" onclick="carregarTreino('B')">
      <span style="font-size: 2rem; font-weight: 700;">B</span>
      <span style="font-size: 0.8rem; color: var(--text-muted, #64748b);">Lower A</span>
    </button>
    <button class="treino-btn" onclick="carregarTreino('C')">
      <span style="font-size: 2rem; font-weight: 700;">C</span>
      <span style="font-size: 0.8rem; color: var(--text-muted, #64748b);">Upper B</span>
    </button>
    <button class="treino-btn" onclick="carregarTreino('D')">
      <span style="font-size: 2rem; font-weight: 700;">D</span>
      <span style="font-size: 0.8rem; color: var(--text-muted, #64748b);">Lower B</span>
    </button>
  </div>
</div>

<div id="treino-content" style="display: none;">
  <button onclick="voltarSelector()" style="margin-bottom: 1.5rem; background: none; border: 1px solid #3b82f6; color: #3b82f6; padding: 0.4rem 1rem; border-radius: 6px; cursor: pointer; font-size: 0.9rem;">
    ← Escolher outro treino
  </button>
  <div id="treino-detail"></div>
</div>

<style>
  .treino-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1.5rem 1rem;
    background: var(--surface, #ffffff);
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    cursor: pointer;
    transition: border-color 0.15s, transform 0.1s;
    gap: 0.25rem;
  }
  .treino-btn:hover, .treino-btn:active {
    border-color: #3b82f6;
    transform: scale(0.98);
  }
  .treino-btn span:first-child {
    color: #3b82f6;
  }
</style>

<script>
  var SERIE_URL = "{{ '/serie-academia' | relative_url }}";

  async function carregarTreino(letra) {
    var detail = document.getElementById('treino-detail');
    detail.innerHTML = '<p style="color:#64748b">Carregando...</p>';
    document.getElementById('treino-selector').style.display = 'none';
    document.getElementById('treino-content').style.display = 'block';
    window.scrollTo(0, 0);

    try {
      var resp = await fetch(SERIE_URL);
      var html = await resp.text();
      var parser = new DOMParser();
      var doc = parser.parseFromString(html, 'text/html');
      var main = doc.querySelector('#main');

      if (!main) { detail.innerHTML = '<p>Erro ao carregar o treino.</p>'; return; }

      var headings = main.querySelectorAll('h2');
      var targetH2 = null;
      for (var i = 0; i < headings.length; i++) {
        if (headings[i].textContent.toUpperCase().includes('TREINO ' + letra)) {
          targetH2 = headings[i];
          break;
        }
      }

      if (!targetH2) { detail.innerHTML = '<p>Treino ' + letra + ' não encontrado.</p>'; return; }

      var content = targetH2.outerHTML;
      var sibling = targetH2.nextElementSibling;
      while (sibling && sibling.tagName !== 'H2') {
        content += sibling.outerHTML;
        sibling = sibling.nextElementSibling;
      }

      detail.innerHTML = content;
    } catch (e) {
      detail.innerHTML = '<p>Erro ao carregar. Verifique sua conexão.</p>';
    }
  }

  function voltarSelector() {
    document.getElementById('treino-content').style.display = 'none';
    document.getElementById('treino-selector').style.display = 'block';
    window.scrollTo(0, 0);
  }
</script>
