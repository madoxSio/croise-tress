<script setup lang="ts">
/**
 * Meyron, la mascotte : un mini ourson doudou, écharpe violette à damier de grille et
 * crayon à la patte (le lien avec les mots croisés).
 * Purement décorative (aria-hidden) : le texte qui l'accompagne porte l'information.
 *
 * - `mood` choisit la pose et le mouvement : `idle` (respiration, clignement, oreilles),
 *   `wave` (la patte salue), `cheer` (petits sauts de joie, yeux rieurs).
 * - `entrance` joue une arrivée par rebond (~900 ms) avant l'humeur.
 *
 * La pose de chaque humeur est portée par un `transform` CSS de base, et non par l'animation :
 * quand la réduction des animations les ramène à 0,01 ms (main.css), l'ourson reste visible,
 * en place et dans la bonne pose (patte levée pour `wave` et `cheer`).
 */
type MeyronMood = 'idle' | 'wave' | 'cheer'

withDefaults(defineProps<{ animated?: boolean; mood?: MeyronMood; entrance?: boolean }>(), {
  animated: true,
  mood: 'idle',
  entrance: false,
})

// Identifiants de dégradés uniques : plusieurs mascottes peuvent cohabiter sur une page.
const uid = useId()
const furGradient = `sgd-fur-${uid}`
const scarfGradient = `sgd-scarf-${uid}`

// Couleurs partagées par les formes du dessin (une seule source pour rester cohérent).
const fur = '#c98a5a'
const furLight = '#f3d4ae'
const outline = '#7a4a2b'
const ink = '#16132a'
</script>

<template>
  <svg
    viewBox="0 0 240 240"
    aria-hidden="true"
    focusable="false"
    class="meyron"
    :class="[`is-${mood}`, { 'is-animated': animated, 'has-entrance': animated && entrance }]"
  >
    <defs>
      <linearGradient :id="furGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#d89a69" />
        <stop offset="1" stop-color="#c07f50" />
      </linearGradient>
      <linearGradient :id="scarfGradient" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#8366ff" />
        <stop offset="1" stop-color="#4521de" />
      </linearGradient>
    </defs>

    <ellipse class="sgd-shadow" cx="120" cy="229" rx="62" ry="7" :fill="ink" opacity="0.14" />

    <g class="sgd-arrive">
      <g class="sgd-figure">
        <!-- Corps assis et ventre clair -->
        <ellipse
          cx="120"
          cy="178"
          rx="58"
          ry="48"
          :fill="`url(#${furGradient})`"
          :stroke="outline"
          stroke-width="3"
        />
        <ellipse cx="120" cy="188" rx="35" ry="29" :fill="furLight" />

        <!-- Pieds et coussinets -->
        <g :fill="fur" :stroke="outline" stroke-width="3">
          <ellipse cx="84" cy="215" rx="23" ry="15" />
          <ellipse cx="156" cy="215" rx="23" ry="15" />
        </g>
        <ellipse cx="84" cy="217" rx="12" ry="8" :fill="furLight" />
        <ellipse cx="156" cy="217" rx="12" ry="8" :fill="furLight" />

        <!-- Bras gauche : celui qui salue (pivot à l'épaule, voir le CSS) -->
        <g class="sgd-arm">
          <ellipse
            cx="68"
            cy="184"
            rx="14"
            ry="25"
            transform="rotate(25 68 184)"
            :fill="fur"
            :stroke="outline"
            stroke-width="3"
          />
        </g>

        <!-- Bras droit et crayon tenu dans la patte -->
        <ellipse
          cx="172"
          cy="184"
          rx="14"
          ry="25"
          transform="rotate(-25 172 184)"
          :fill="fur"
          :stroke="outline"
          stroke-width="3"
        />
        <g transform="translate(184 200) rotate(24)">
          <path
            d="M-7 10 L0 25 L7 10 Z"
            fill="#f4dcb4"
            :stroke="ink"
            stroke-width="2.5"
            stroke-linejoin="round"
          />
          <path d="M-2.6 19 L0 25 L2.6 19 Z" :fill="ink" />
          <rect
            x="-7"
            y="-46"
            width="14"
            height="56"
            fill="#ffd84d"
            :stroke="ink"
            stroke-width="2.5"
          />
          <rect x="-1.8" y="-46" width="3.6" height="56" fill="#f2b632" />
          <rect
            x="-7"
            y="-53"
            width="14"
            height="7"
            fill="#d9d4ea"
            :stroke="ink"
            stroke-width="2.5"
          />
          <rect
            x="-7"
            y="-63"
            width="14"
            height="11"
            rx="5"
            fill="#ff8fa3"
            :stroke="ink"
            stroke-width="2.5"
          />
          <ellipse cx="-1" cy="-4" rx="11" ry="10" :fill="fur" :stroke="outline" stroke-width="3" />
        </g>

        <g class="sgd-head">
          <!-- Oreilles rondes, intérieur clair -->
          <g class="sgd-ear sgd-ear-left">
            <circle cx="64" cy="46" r="26" :fill="fur" :stroke="outline" stroke-width="3" />
            <circle cx="67" cy="49" r="14" :fill="furLight" />
          </g>
          <g class="sgd-ear sgd-ear-right">
            <circle cx="176" cy="46" r="26" :fill="fur" :stroke="outline" stroke-width="3" />
            <circle cx="173" cy="49" r="14" :fill="furLight" />
          </g>

          <!-- Tête ronde et reflet doux -->
          <ellipse
            cx="120"
            cy="94"
            rx="70"
            ry="60"
            :fill="`url(#${furGradient})`"
            :stroke="outline"
            stroke-width="3"
          />
          <ellipse
            cx="94"
            cy="58"
            rx="30"
            ry="13"
            fill="#ffffff"
            opacity="0.14"
            transform="rotate(-12 94 58)"
          />

          <!-- Yeux : rieurs pour la victoire, grands et brillants sinon -->
          <path
            v-if="mood === 'cheer'"
            d="M84 101 Q94 88 104 101 M136 101 Q146 88 156 101"
            fill="none"
            :stroke="ink"
            stroke-width="5"
            stroke-linecap="round"
          />
          <g v-else class="sgd-eyes">
            <ellipse cx="94" cy="98" rx="9.5" ry="12" :fill="ink" />
            <ellipse cx="146" cy="98" rx="9.5" ry="12" :fill="ink" />
            <circle cx="97.5" cy="93" r="4" fill="#ffffff" />
            <circle cx="149.5" cy="93" r="4" fill="#ffffff" />
            <circle cx="91.5" cy="103" r="1.8" fill="#ffffff" />
            <circle cx="143.5" cy="103" r="1.8" fill="#ffffff" />
          </g>

          <!-- Joues -->
          <ellipse cx="74" cy="120" rx="12" ry="7.5" fill="#ff8fa3" opacity="0.8" />
          <ellipse cx="166" cy="120" rx="12" ry="7.5" fill="#ff8fa3" opacity="0.8" />

          <!-- Museau, truffe et bouche -->
          <ellipse cx="120" cy="123" rx="25" ry="19" :fill="furLight" />
          <path
            d="M110 113 Q120 108 130 113 Q130 120 120 124 Q110 120 110 113 Z"
            :fill="ink"
            :stroke="ink"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <ellipse cx="116" cy="112.5" rx="3" ry="1.6" fill="#ffffff" opacity="0.7" />
          <path
            v-if="mood === 'cheer'"
            d="M110 127 Q120 141 130 127 Z"
            :fill="ink"
            :stroke="ink"
            stroke-width="2.6"
            stroke-linejoin="round"
          />
          <path
            v-else
            d="M120 124 V128 M111 128 Q115.5 134 120 128 Q124.5 134 129 128"
            fill="none"
            :stroke="ink"
            stroke-width="2.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </g>

        <!-- Écharpe violette, pan à damier de grille et franges citron -->
        <path
          d="M70 140 Q120 158 170 140 L172 157 Q120 177 68 157 Z"
          :fill="`url(#${scarfGradient})`"
          :stroke="`url(#${scarfGradient})`"
          stroke-width="5"
          stroke-linejoin="round"
        />
        <g transform="rotate(8 104 160)">
          <rect x="94" y="158" width="21" height="44" rx="4" fill="#5634f0" />
          <rect x="95.5" y="181" width="9" height="9" rx="1.5" fill="#ffffff" />
          <rect x="104.5" y="190" width="9" height="9" rx="1.5" fill="#ffffff" />
          <path
            d="M98 203 v6 M104.5 203 v6 M111 203 v6"
            stroke="#c8f53c"
            stroke-width="3"
            stroke-linecap="round"
          />
        </g>
        <rect x="98" y="149" width="22" height="17" rx="7" fill="#4521de" />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.meyron {
  overflow: visible;
}

/*
 * fill-box seulement sur les groupes animés : sur les formes portant un attribut transform
 * (rotate(a cx cy)), il déplacerait l'origine de cet attribut et décalerait le dessin.
 */
.sgd-shadow,
.sgd-arrive,
.sgd-figure,
.sgd-head,
.sgd-ear,
.sgd-eyes,
.sgd-arm {
  transform-box: fill-box;
}

.sgd-shadow,
.sgd-eyes {
  transform-origin: center;
}

/* Bas du personnage : il respire, saute et atterrit sur ses pieds. */
.sgd-arrive,
.sgd-figure {
  transform-origin: 50% 100%;
}

.sgd-head {
  transform-origin: 50% 85%;
}

/* Base de chaque oreille, côté tête. */
.sgd-ear-left {
  transform-origin: 85% 85%;
}

.sgd-ear-right {
  transform-origin: 15% 85%;
}

/*
 * Épaule : haut du bras, côté corps. Pourcentages de la boîte englobante du groupe telle que
 * Chromium la calcule pour l'ellipse pivotée (x 44,7 → 91,3 ; y 155,4 → 212,6), soit (76, 165).
 */
.sgd-arm {
  transform-origin: 67% 17%;
}

/* Poses portées hors animation : elles survivent à la réduction des animations. */
.is-wave .sgd-arm {
  transform: rotate(112deg);
}

.is-cheer .sgd-arm {
  transform: rotate(118deg);
}

/* --- Humeur idle --- */
.is-animated.is-idle .sgd-figure {
  animation: sgd-breathe 3.4s ease-in-out infinite;
}

.is-animated.is-idle .sgd-head {
  animation: sgd-tilt 6.8s ease-in-out infinite;
}

.is-animated.is-idle .sgd-ear-left {
  animation: sgd-ear-left 5.6s ease-in-out infinite;
}

.is-animated.is-idle .sgd-ear-right {
  animation: sgd-ear-right 5.6s ease-in-out 0.3s infinite;
}

.is-animated .sgd-eyes {
  animation: sgd-blink 5s infinite;
}

/* --- Humeur wave --- */
.is-animated.is-wave .sgd-figure {
  animation: sgd-breathe 3.4s ease-in-out infinite;
}

.is-animated.is-wave .sgd-arm {
  animation: sgd-wave 2.4s ease-in-out infinite;
}

/* --- Humeur cheer --- */
.is-animated.is-cheer .sgd-figure {
  animation: sgd-jump 1.1s ease-in-out infinite;
}

.is-animated.is-cheer .sgd-shadow {
  animation: sgd-jump-shadow 1.1s ease-in-out infinite;
}

.is-animated.is-cheer .sgd-arm {
  animation: sgd-cheer-arm 0.55s ease-in-out infinite alternate;
}

/*
 * --- Arrivée : rebond puis humeur ---
 * Les animations d'humeur attendent la fin de l'arrivée. Le sélecteur porte quatre classes pour
 * l'emporter sur les raccourcis `animation` des humeurs, qui remettraient le délai à 0.
 */
.meyron.has-entrance .sgd-arrive {
  animation: sgd-arrive 0.9s cubic-bezier(0.3, 0.7, 0.4, 1);
}

.meyron.has-entrance .sgd-shadow {
  animation: sgd-arrive-shadow 0.9s ease-out;
}

.meyron.is-animated.has-entrance .sgd-figure,
.meyron.is-animated.has-entrance .sgd-head,
.meyron.is-animated.has-entrance .sgd-ear,
.meyron.is-animated.has-entrance .sgd-eyes,
.meyron.is-animated.has-entrance .sgd-arm {
  animation-delay: 0.9s;
}

/*
 * L'ombre de cheer prend le relais après l'arrivée : deux animations sur le même élément,
 * la seconde retardée.
 */
.meyron.has-entrance.is-cheer .sgd-shadow {
  animation:
    sgd-arrive-shadow 0.9s ease-out,
    sgd-jump-shadow 1.1s ease-in-out 0.9s infinite;
}

@keyframes sgd-breathe {
  0%,
  100% {
    transform: scale(1, 1);
  }
  50% {
    transform: scale(0.985, 1.025);
  }
}

@keyframes sgd-tilt {
  0%,
  100% {
    transform: rotate(0deg);
  }
  30% {
    transform: rotate(-2.5deg);
  }
  70% {
    transform: rotate(2deg);
  }
}

@keyframes sgd-ear-left {
  0%,
  70%,
  100% {
    transform: rotate(0deg);
  }
  78% {
    transform: rotate(-10deg);
  }
  86% {
    transform: rotate(4deg);
  }
}

@keyframes sgd-ear-right {
  0%,
  70%,
  100% {
    transform: rotate(0deg);
  }
  78% {
    transform: rotate(10deg);
  }
  86% {
    transform: rotate(-4deg);
  }
}

@keyframes sgd-blink {
  0%,
  92%,
  100% {
    transform: scaleY(1);
  }
  95% {
    transform: scaleY(0.1);
  }
}

@keyframes sgd-wave {
  0%,
  60%,
  100% {
    transform: rotate(112deg);
  }
  15%,
  45% {
    transform: rotate(126deg);
  }
  30% {
    transform: rotate(94deg);
  }
}

@keyframes sgd-cheer-arm {
  from {
    transform: rotate(108deg);
  }
  to {
    transform: rotate(124deg);
  }
}

@keyframes sgd-jump {
  0%,
  70%,
  100% {
    transform: translateY(0) scale(1, 1);
  }
  12% {
    transform: translateY(0) scale(1.06, 0.92);
  }
  35% {
    transform: translateY(-18px) scale(0.95, 1.06);
  }
  55% {
    transform: translateY(0) scale(1.06, 0.94);
  }
}

@keyframes sgd-jump-shadow {
  0%,
  70%,
  100% {
    transform: scaleX(1);
    opacity: 0.14;
  }
  35% {
    transform: scaleX(0.7);
    opacity: 0.08;
  }
}

@keyframes sgd-arrive {
  0% {
    opacity: 0;
    transform: translateY(70px) scale(0.9, 1.1);
  }
  45% {
    opacity: 1;
    transform: translateY(-16px) scale(0.94, 1.08);
  }
  65% {
    transform: translateY(0) scale(1.1, 0.88);
  }
  82% {
    transform: translateY(-3px) scale(0.97, 1.03);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1, 1);
  }
}

@keyframes sgd-arrive-shadow {
  0% {
    opacity: 0;
    transform: scaleX(0.3);
  }
  65% {
    opacity: 0.14;
    transform: scaleX(1.1);
  }
  100% {
    opacity: 0.14;
    transform: scaleX(1);
  }
}
</style>
