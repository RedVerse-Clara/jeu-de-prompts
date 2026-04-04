# Changelog — Jeu de Prompts

Historique de toutes les modifications apportées au projet.

---

## 2026-04-04 — Promo lancement et preuve sociale

### Landing page
- Ajout d'un bandeau promo « -50% jusqu'au 30 avril » avec le code FORMATEUR copiable au clic
- Ajout d'une section témoignages avec 3 avis de formateurs (Sophie L., Karim D., Claire M.)

### Fix cache CDN Substack

- Correction du script de sync blog : ajout d'un cache-busting (timestamp + headers no-cache) pour forcer l'API Substack à renvoyer les derniers articles depuis les runners GitHub Actions
- Synchronisation du nouvel article « Claude Max à 100€/mois : bonne idée pour un formateur indépendant ? »

---

## 2026-04-03 — Correction sync blog Substack

- Correction de la GitHub Action de synchronisation quotidienne du blog (ajout d'un User-Agent pour éviter le blocage par Substack)
- Ajout d'un mécanisme de retry (3 tentatives) en cas d'échec réseau
- Mise à jour des actions GitHub vers v5 et Node.js 22 (suppression du warning de dépréciation Node 20)

---

## 2026-04-02 — Blog SEO, abonnement Stripe, navigation desktop

### Blog Substack
- Import automatique des 45 articles Substack en pages HTML statiques pour le SEO
- Chaque article a ses propres meta tags, Open Graph, Twitter Cards et JSON-LD Article
- Page index du blog avec cards articles (jeudeprompts.fr/blog/)
- Fil d'Ariane et navigation Précédent/Suivant sur chaque article
- CTA newsletter Substack en bas de chaque article
- GitHub Action quotidienne (6h UTC) pour synchroniser les nouveaux articles
- Sitemap mis à jour avec 47 URLs indexables (contre 2 auparavant)

### Abonnement Stripe
- Ajout du lien "Gérer mon abonnement" vers le portail client Stripe
- Présent sur la page d'accueil (section formules) et l'écran compte en attente

### Navigation desktop
- Menu horizontal scrollable avec fade sur les bords et scrollbar stylée
- Carte "Blog" ajoutée dans les social cards de la landing page

### Technique
- Service Worker basculé en network-first (résout les problèmes de cache)
- Cache-bust ?v=6 sur tous les assets (style.css, app.js, toc.js)
- Scrollbar épaisse (8px) sur les pages blog et la zone de contenu articles
- URL sitemap en absolu dans robots.txt

---

## 2026-03-30 — Actualités et menu mobile

### Actualités
- Correction du module Actualités : ajout du champ contenu (corps de news) manquant
- Remplacement du formulaire inline par l'éditeur Quill riche (identique à celui des fiches)
- Correction du bouton Éditer qui ne fonctionnait pas (fetch par ID au lieu de paramètres inline)

### Mobile
- Ajout des rubriques Actualités et Liens utiles dans le menu hamburger mobile

---

## 2026-03-23 — Recherche, navigation, communauté, administration

### Espace communautaire
- Ajout d'un espace de discussion communautaire avec sélecteur d'emojis
- Ajout des emojis dans les réponses aux discussions

### Navigation
- Refonte de la navigation : boutons desktop + menu hamburger mobile

### Recherche
- Remplacement de la recherche IA par une recherche locale intelligente sur toutes les fiches
- Restauration de la recherche IA via smooth-worker, avec fallback local pour les mots simples
- Vidage automatique de la recherche lors du changement d'onglet/section
- Déclenchement de la recherche uniquement sur Entrée
- Ajout du filtrage des stop words français avant requête IA, puis retrait (envoi brut à GPT)
- Ajout d'un bouton (X) pour effacer la recherche et les résultats
- Limitation du champ de recherche à 150 caractères

### Administration
- Ajout de la gestion des sections (ajout/renommage/suppression/réordonnancement) dans la console admin
- Déplacement de la toolbar personnalisée au-dessus de l'éditeur Quill
- Ajout d'un sélecteur de catégorie dans le modal d'édition
- Ajout de l'ordonnancement des ressources

---

## 2026-03-21 — SEO et partage

- Ajout des balises Open Graph, Twitter Cards, données structurées et meta améliorées pour de meilleurs aperçus de liens

---

## 2026-03-20 — Analytics

- Ajout du script de tracking Umami
- Correction : exclusion des requêtes externes du Service Worker pour débloquer Umami

---

## 2026-03-19 — PWA et corrections

- Amélioration du style du bandeau d'installation PWA (aligné sur le design ULIB)
- Correction : accès admin restreint, suppression d'utilisateur auth, badge enveloppe, ordre des tarifs, manifest PWA
- Correction : enveloppe visible uniquement avec des messages non lus, rafraîchissement forcé du cache PWA
- Correction : logging d'erreur de mark-read sur l'enveloppe, orientation du manifest PWA + reset du dismiss

---

## 2026-03-17 — Lancement v1.0 et administration

### Lancement
- Release initiale — Jeu de Prompts v1.0

### Administration et notifications
- Correction : utilisation d'un ID admin codé en dur pour la messagerie
- Ajout d'un badge de notification des utilisateurs en attente sur le bouton Admin
- Ajout : notification enveloppe, vue des messages admin, bouton de suppression d'utilisateur
- Correction : l'enveloppe ouvre les messages admin, retrait du badge Marc, politiques de suppression d'utilisateur
- Correction de sécurité : accès admin restreint à l'ID de Marc uniquement
- Correction : vidage du badge enveloppe après lecture des messages
