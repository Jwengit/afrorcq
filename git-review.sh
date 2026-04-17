#!/usr/bin/env bash
# git-review.sh — Outil interactif pour réviser et pousser vos modifications Git en toute sécurité.
# Usage : bash git-review.sh

set -euo pipefail

# ─── Couleurs ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ─── Fichiers à ne JAMAIS committer ───────────────────────────────────────────
SENSITIVE_PATTERNS=(
    "\.env$"
    "\.env\.local$"
    "\.env\.production$"
    "\.env\.development$"
    "\.pem$"
    "\.key$"
    "id_rsa"
    "id_ed25519"
    "\.p12$"
    "\.pfx$"
    "secrets\."
    "credentials\."
)

# ─── Fonctions utilitaires ────────────────────────────────────────────────────
print_section() {
    echo ""
    echo -e "${CYAN}${BOLD}══════════════════════════════════════════${RESET}"
    echo -e "${CYAN}${BOLD}  $1${RESET}"
    echo -e "${CYAN}${BOLD}══════════════════════════════════════════${RESET}"
}

is_sensitive() {
    local file="$1"
    for pattern in "${SENSITIVE_PATTERNS[@]}"; do
        if echo "$file" | grep -qE "$pattern"; then
            return 0
        fi
    done
    return 1
}

# ─── Vérifier que nous sommes dans un dépôt Git ───────────────────────────────
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}❌ Erreur : Ce dossier n'est pas un dépôt Git.${RESET}"
    echo -e "   Assurez-vous d'être dans le bon dossier du projet avant de lancer ce script."
    exit 1
fi

# ─── Détecter la branche courante ────────────────────────────────────────────
CURRENT_BRANCH="$(git branch --show-current)"
if [ -z "$CURRENT_BRANCH" ]; then
    CURRENT_BRANCH="main"
fi

# ─── Étape 1 : Affichage du statut Git ────────────────────────────────────────
print_section "ÉTAPE 1 — Fichiers modifiés"
echo -e "${BOLD}📋 Voici tous les fichiers qui ont été modifiés depuis le dernier commit :${RESET}"
echo ""
git --no-pager status --short

# Collecter les fichiers modifiés / nouveaux
MODIFIED_FILES=()
while IFS= read -r line; do
    # Extraire le nom de fichier (3e colonne de `git status --short`)
    file="${line:3}"
    # Supprimer les guillemets éventuels
    file="${file//\"/}"
    MODIFIED_FILES+=("$file")
done < <(git status --short)

if [ ${#MODIFIED_FILES[@]} -eq 0 ]; then
    echo -e "${GREEN}✅ Aucune modification détectée. Votre dépôt est à jour.${RESET}"
    exit 0
fi

# ─── Étape 2 : Détection des fichiers sensibles ────────────────────────────────
print_section "ÉTAPE 2 — Vérification de sécurité"
echo -e "${BOLD}🔍 Recherche de fichiers potentiellement dangereux à ne pas committer…${RESET}"
echo ""

DANGEROUS_FILES=()
SAFE_FILES=()

for file in "${MODIFIED_FILES[@]}"; do
    if is_sensitive "$file"; then
        DANGEROUS_FILES+=("$file")
        echo -e "  ${RED}⛔ DANGEREUX${RESET}  →  $file"
        echo -e "     ${YELLOW}↳ Ce fichier peut contenir des mots de passe ou des clés secrètes.${RESET}"
    else
        SAFE_FILES+=("$file")
        echo -e "  ${GREEN}✅ Sûr${RESET}        →  $file"
    fi
done

if [ ${#DANGEROUS_FILES[@]} -gt 0 ]; then
    echo ""
    echo -e "${RED}${BOLD}⚠️  ATTENTION : ${#DANGEROUS_FILES[@]} fichier(s) dangereux détecté(s) !${RESET}"
    echo -e "${YELLOW}   Ces fichiers ne doivent JAMAIS être commités car ils peuvent contenir"
    echo -e "   des informations confidentielles (mots de passe, tokens, clés API).${RESET}"
    echo -e "${YELLOW}   Conseil : ajoutez-les à votre fichier .gitignore si ce n'est pas déjà fait.${RESET}"
fi

# ─── Étape 3 : Résumé des modifications en français ───────────────────────────
print_section "ÉTAPE 3 — Résumé de vos modifications"
echo -e "${BOLD}📝 Voici un résumé des changements détectés :${RESET}"
echo ""

ADDED=0
MODIFIED=0
DELETED=0
RENAMED=0
UNTRACKED=0

while IFS= read -r line; do
    status_code="${line:0:2}"
    # status_code is exactly 2 chars: XY where X=index status, Y=working-tree status
    # Count by index status (X), then also check working-tree status (Y)
    index_char="${status_code:0:1}"
    worktree_char="${status_code:1:1}"
    case "$status_code" in
        "??") UNTRACKED=$((UNTRACKED + 1)) ;;
        *)
            case "$index_char" in
                "A") ADDED=$((ADDED + 1)) ;;
                "M") MODIFIED=$((MODIFIED + 1)) ;;
                "D") DELETED=$((DELETED + 1)) ;;
                "R") RENAMED=$((RENAMED + 1)) ;;
            esac
            # Also count working-tree changes not yet staged
            case "$worktree_char" in
                "M") [ "$index_char" = " " ] && MODIFIED=$((MODIFIED + 1)) ;;
                "D") [ "$index_char" = " " ] && DELETED=$((DELETED + 1)) ;;
            esac
            ;;
    esac
done < <(git status --short)

[ "$ADDED"     -gt 0 ] && echo -e "  ${GREEN}+ $ADDED nouveau(x) fichier(s) ajouté(s)${RESET}"
[ "$MODIFIED"  -gt 0 ] && echo -e "  ${CYAN}~ $MODIFIED fichier(s) modifié(s)${RESET}"
[ "$DELETED"   -gt 0 ] && echo -e "  ${RED}- $DELETED fichier(s) supprimé(s)${RESET}"
[ "$RENAMED"   -gt 0 ] && echo -e "  ${YELLOW}↻ $RENAMED fichier(s) renommé(s)${RESET}"
[ "$UNTRACKED" -gt 0 ] && echo -e "  ${YELLOW}? $UNTRACKED fichier(s) non suivis (non ajoutés au suivi Git)${RESET}"

echo ""
echo -e "${BOLD}Détail des modifications :${RESET}"
git --no-pager diff --stat HEAD 2>/dev/null || echo -e "  (Nouveaux fichiers non encore suivis — utilisez 'git add' pour les inclure)"

# ─── Étape 4 : Proposition de message de commit ────────────────────────────────
print_section "ÉTAPE 4 — Message de commit suggéré"
echo -e "${BOLD}💬 Voici un message de commit proposé automatiquement :${RESET}"
echo ""

# Construire un message de commit descriptif basé sur les types de changements
COMMIT_PARTS=()
[ "$ADDED"     -gt 0 ] && COMMIT_PARTS+=("ajout de $ADDED fichier(s)")
[ "$MODIFIED"  -gt 0 ] && COMMIT_PARTS+=("modification de $MODIFIED fichier(s)")
[ "$DELETED"   -gt 0 ] && COMMIT_PARTS+=("suppression de $DELETED fichier(s)")
[ "$RENAMED"   -gt 0 ] && COMMIT_PARTS+=("renommage de $RENAMED fichier(s)")
[ "$UNTRACKED" -gt 0 ] && COMMIT_PARTS+=("ajout de $UNTRACKED nouveau(x) fichier(s) non suivis")

if [ ${#COMMIT_PARTS[@]} -gt 0 ]; then
    COMMIT_DESCRIPTION=$(IFS=", "; echo "${COMMIT_PARTS[*]}")
    SUGGESTED_MSG="feat: ${COMMIT_DESCRIPTION}"
else
    SUGGESTED_MSG="chore: mise à jour des fichiers du projet"
fi

echo -e "  ${BOLD}\"${SUGGESTED_MSG}\"${RESET}"
echo ""
echo -e "${YELLOW}  ℹ️  Vous pouvez personnaliser ce message selon vos besoins.${RESET}"
echo -e "${YELLOW}  Exemples de bons messages de commit :${RESET}"
echo -e "    • feat: ajouter la page de connexion"
echo -e "    • fix: corriger l'erreur d'authentification"
echo -e "    • chore: mettre à jour les dépendances"
echo -e "    • docs: améliorer le README"

# ─── Étape 5 : Commandes Git à exécuter ───────────────────────────────────────
print_section "ÉTAPE 5 — Commandes Git à exécuter"
echo -e "${BOLD}🚀 Voici les commandes exactes à copier-coller dans votre terminal :${RESET}"
echo ""

# Construire la liste des fichiers sûrs seulement
SAFE_FILES_STR="${SAFE_FILES[*]:-}"

echo -e "${BOLD}${GREEN}# ── 1. Ajouter vos fichiers à la zone de préparation (staging) ─────────────${RESET}"
echo -e "${YELLOW}#   Explication : 'git add' indique à Git quels fichiers vous voulez inclure"
echo -e "#   dans le prochain commit. C'est comme mettre vos fichiers dans une enveloppe"
echo -e "#   avant de l'envoyer.${RESET}"
echo ""
if [ ${#SAFE_FILES[@]} -gt 0 ]; then
    echo -e "${GREEN}git add ${SAFE_FILES[*]}${RESET}"
else
    echo -e "${YELLOW}# ⚠️  Aucun fichier sûr à ajouter. Vérifiez vos fichiers ci-dessus.${RESET}"
fi

echo ""
echo -e "${BOLD}${GREEN}# ── 2. Créer le commit (enregistrer vos modifications) ─────────────────────${RESET}"
echo -e "${YELLOW}#   Explication : 'git commit' sauvegarde un « instantané » de votre projet"
echo -e "#   avec un message descriptif. C'est comme prendre une photo de votre travail.${RESET}"
echo ""
echo -e "${GREEN}git commit -m \"${SUGGESTED_MSG}\"${RESET}"

echo ""
echo -e "${BOLD}${GREEN}# ── 3. Envoyer vos modifications sur GitHub (push) ─────────────────────────${RESET}"
echo -e "${YELLOW}#   Explication : 'git push' envoie votre commit local vers GitHub (le serveur"
echo -e "#   distant). C'est l'étape qui rend vos modifications visibles en ligne.${RESET}"
echo ""
echo -e "${GREEN}git push origin ${CURRENT_BRANCH}${RESET}"

# ─── Étape 6 : Récapitulatif des avertissements ───────────────────────────────
if [ ${#DANGEROUS_FILES[@]} -gt 0 ]; then
    print_section "⚠️  RÉCAPITULATIF DES AVERTISSEMENTS"
    echo -e "${RED}${BOLD}Les fichiers suivants ne doivent PAS être committés :${RESET}"
    for f in "${DANGEROUS_FILES[@]}"; do
        echo -e "  ${RED}• $f${RESET}"
    done
    echo ""
    echo -e "${YELLOW}Pour les ignorer définitivement, ajoutez-les à .gitignore :${RESET}"
    echo -e "${GREEN}echo \"${DANGEROUS_FILES[0]}\" >> .gitignore${RESET}"
    echo ""
    echo -e "${YELLOW}Pour les retirer de la zone de préparation si vous les avez déjà ajoutés :${RESET}"
    echo -e "${GREEN}git reset HEAD <nom-du-fichier>${RESET}"
fi

# ─── Étape 7 : Confirmation avant push ────────────────────────────────────────
print_section "ÉTAPE 7 — Confirmation avant d'envoyer sur GitHub"
echo -e "${BOLD}Récapitulatif de ce qui va être envoyé :${RESET}"
echo ""
echo -e "  📁 Fichiers sûrs à committer  : ${GREEN}${#SAFE_FILES[@]}${RESET}"
echo -e "  ⛔ Fichiers dangereux exclus  : ${RED}${#DANGEROUS_FILES[@]}${RESET}"
echo -e "  💬 Message de commit          : \"${SUGGESTED_MSG}\""
echo -e "  🌐 Destination                : origin/${CURRENT_BRANCH}"
echo ""

if [ ${#SAFE_FILES[@]} -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Il n'y a aucun fichier sûr à committer.${RESET}"
    echo -e "   Vérifiez vos fichiers et relancez ce script."
    exit 0
fi

echo -e "${BOLD}Voulez-vous exécuter ces commandes maintenant ? (oui/non)${RESET}"
echo -e "${YELLOW}ℹ️  Tapez 'oui' pour confirmer, ou 'non' pour annuler.${RESET}"
read -r CONFIRMATION

if [[ "$CONFIRMATION" == "oui" || "$CONFIRMATION" == "o" ]]; then
    echo ""
    echo -e "${BOLD}▶ Exécution de : git add ${SAFE_FILES[*]}${RESET}"
    git add "${SAFE_FILES[@]}"
    echo -e "${GREEN}✅ Fichiers ajoutés à la zone de préparation.${RESET}"

    echo ""
    echo -e "${BOLD}▶ Exécution de : git commit -m \"${SUGGESTED_MSG}\"${RESET}"
    git commit -m "${SUGGESTED_MSG}"
    echo -e "${GREEN}✅ Commit créé avec succès.${RESET}"

    echo ""
    echo -e "${BOLD}▶ Exécution de : git push origin ${CURRENT_BRANCH}${RESET}"
    git push origin "${CURRENT_BRANCH}"
    echo -e "${GREEN}✅ Vos modifications ont été envoyées sur GitHub !${RESET}"
    echo ""
    echo -e "${GREEN}${BOLD}🎉 Félicitations ! Votre travail est maintenant visible sur GitHub.${RESET}"
else
    echo ""
    echo -e "${YELLOW}❌ Opération annulée. Aucune modification n'a été envoyée.${RESET}"
    echo -e "   Vous pouvez relancer ce script quand vous êtes prêt(e)."
    echo ""
    echo -e "${BOLD}Pour envoyer manuellement, copiez-collez ces commandes dans votre terminal :${RESET}"
    echo ""
    [ ${#SAFE_FILES[@]} -gt 0 ] && echo -e "${GREEN}git add ${SAFE_FILES[*]}${RESET}"
    echo -e "${GREEN}git commit -m \"${SUGGESTED_MSG}\"${RESET}"
    echo -e "${GREEN}git push origin ${CURRENT_BRANCH}${RESET}"
fi
