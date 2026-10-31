# Ação SAF – Portal de Gestão de Atletas

Site com login por CPF para a Sociedade Ação de Futebol (Ação SAF). Tema preto com listras vermelhas e brancas.

## Perfis
- **Administrador** (CPF fixo `063.660.843-35`): painel global, cadastro de usuários/jogos/cronograma e alternância de função no canto superior direito (informa o CPF a visualizar).
- **Comissão Técnica**: um CPF pode ter várias categorias (menu "Equipe X", "Outras categorias"); relaciona/promove jogadoras e monta o campo tático (arrastar e soltar).
- **Presidente**: visualiza todas as categorias, sem editar.
- **Jogadora**: dados pessoais (sem CPF), próximos jogos (com selo "Relacionada") e cronograma da semana.

Categorias por idade: Sub-17 (14–17), Sub-20 (18–20), Profissional (21+), separadas por gênero (modalidade).

## Rodar
```bash
node server.js   # Node 18+, sem dependências → http://localhost:3000
```
Dados em `data/db.json` (criado automaticamente, ignorado pelo git).

## Enviar ao GitHub
```bash
git init && git add . && git commit -m "Portal Ação SAF"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/acao-saf.git
git push -u origin main
```

## Atenção (produção)
Login só por CPF é fraco e CPF é dado pessoal (LGPD). Para produção: HTTPS, banco real (PostgreSQL), segundo fator de autenticação e controle de acesso/auditoria.

## Deploy na Vercel
O projeto já está pronto para a Vercel (`api/index.js` + `vercel.json`; a pasta `public/` é servida como site estático).
A Vercel não tem disco persistente, então para **guardar os dados** conecte um banco Redis:
1. No painel da Vercel: *Storage* → *Marketplace* → **Upstash Redis** → conecte ao projeto (cria `KV_REST_API_URL` e `KV_REST_API_TOKEN`).
2. Em *Settings → Environment Variables*, crie `SESSION_SECRET` com um texto longo e aleatório.
3. Faça o redeploy.
Sem o Redis o site funciona, mas os cadastros ficam em `/tmp` e podem sumir a qualquer momento.
