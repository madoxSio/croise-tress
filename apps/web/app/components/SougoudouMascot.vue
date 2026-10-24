<script setup lang="ts">
/**
 * Sougoudou, la mascotte : une case de mots croisés avec un visage et un crayon.
 * Purement décorative (aria-hidden) : le texte qui l'accompagne porte l'information.
 * Les animations (respiration, clignement, crayon) s'arrêtent avec la réduction des animations.
 */
withDefaults(defineProps<{ animated?: boolean }>(), { animated: true })

// Identifiants de dégradés uniques : plusieurs mascottes peuvent cohabiter sur une page.
const uid = useId()
const bodyGradient = `sgd-body-${uid}`
const shineGradient = `sgd-shine-${uid}`
</script>

<template>
  <svg
    viewBox="0 0 220 230"
    aria-hidden="true"
    focusable="false"
    class="sougoudou"
    :class="{ 'is-animated': animated }"
  >
    <defs>
      <linearGradient :id="bodyGradient" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#8366ff" />
        <stop offset="1" stop-color="#4521de" />
      </linearGradient>
      <linearGradient :id="shineGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.45" />
        <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
      </linearGradient>
    </defs>

    <ellipse class="sgd-shadow" cx="108" cy="216" rx="56" ry="8" fill="#16132a" opacity="0.14" />

    <g class="sgd-body">
      <!-- Pieds -->
      <rect x="70" y="186" width="26" height="20" rx="10" fill="#ff5c39" />
      <rect x="120" y="186" width="26" height="20" rx="10" fill="#ff5c39" />

      <!-- Bras gauche (salut) -->
      <g class="sgd-wave">
        <path
          d="M42 128 C26 122 18 108 20 94"
          fill="none"
          stroke="#5a37ef"
          stroke-width="12"
          stroke-linecap="round"
        />
        <circle cx="20" cy="90" r="9" fill="#ffffff" stroke="#5a37ef" stroke-width="4" />
      </g>

      <!-- Corps : la case -->
      <rect x="36" y="44" width="144" height="146" rx="38" :fill="`url(#${bodyGradient})`" />
      <rect x="44" y="50" width="128" height="58" rx="30" :fill="`url(#${shineGradient})`" />
      <text
        x="58"
        y="82"
        font-family="'Bricolage Grotesque Variable', system-ui, sans-serif"
        font-size="22"
        font-weight="800"
        fill="#ffffff"
        opacity="0.85"
      >
        1
      </text>

      <!-- Pastille citron « S » -->
      <g transform="rotate(12 166 48)">
        <rect x="146" y="28" width="40" height="40" rx="11" fill="#c8f53c" />
        <text
          x="166"
          y="57"
          text-anchor="middle"
          font-family="'Bricolage Grotesque Variable', system-ui, sans-serif"
          font-size="26"
          font-weight="800"
          fill="#16132a"
        >
          S
        </text>
      </g>

      <!-- Visage -->
      <g class="sgd-eyes">
        <ellipse cx="86" cy="118" rx="15" ry="17" fill="#ffffff" />
        <ellipse cx="132" cy="118" rx="15" ry="17" fill="#ffffff" />
        <circle cx="90" cy="121" r="8" fill="#16132a" />
        <circle cx="136" cy="121" r="8" fill="#16132a" />
        <circle cx="93" cy="117" r="3" fill="#ffffff" />
        <circle cx="139" cy="117" r="3" fill="#ffffff" />
      </g>
      <ellipse cx="70" cy="146" rx="9" ry="6" fill="#ff8fa3" opacity="0.75" />
      <ellipse cx="148" cy="146" rx="9" ry="6" fill="#ff8fa3" opacity="0.75" />
      <path
        d="M96 144 Q109 162 122 144 Z"
        fill="#16132a"
        stroke="#16132a"
        stroke-width="4"
        stroke-linejoin="round"
      />
      <ellipse cx="109" cy="153" rx="6" ry="3.5" fill="#ff5c39" />

      <!-- Bras droit et crayon -->
      <g class="sgd-pencil">
        <path
          d="M178 140 C192 136 198 126 198 114"
          fill="none"
          stroke="#5a37ef"
          stroke-width="12"
          stroke-linecap="round"
        />
        <g transform="rotate(-28 200 92)">
          <rect x="192" y="58" width="16" height="50" rx="3" fill="#ffd84d" />
          <rect x="192" y="58" width="16" height="10" rx="3" fill="#ff8fa3" />
          <rect x="192" y="66" width="16" height="4" fill="#d9d4ea" />
          <path d="M192 108 L200 124 L208 108 Z" fill="#f4dcb4" />
          <path d="M197.5 119 L200 124 L202.5 119 Z" fill="#16132a" />
        </g>
        <circle cx="198" cy="112" r="9" fill="#ffffff" stroke="#5a37ef" stroke-width="4" />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.sougoudou {
  overflow: visible;
}

.sougoudou * {
  transform-box: fill-box;
}

.is-animated .sgd-body {
  animation: sgd-bob 3.2s ease-in-out infinite;
}

.is-animated .sgd-shadow {
  transform-origin: center;
  animation: sgd-shadow 3.2s ease-in-out infinite;
}

.is-animated .sgd-eyes {
  transform-origin: center;
  animation: sgd-blink 5s infinite;
}

.is-animated .sgd-wave {
  transform-origin: 100% 100%;
  animation: sgd-wave 2.4s ease-in-out infinite;
}

.is-animated .sgd-pencil {
  transform-origin: 0% 100%;
  animation: sgd-scribble 1.6s ease-in-out infinite;
}

@keyframes sgd-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

@keyframes sgd-shadow {
  0%,
  100% {
    transform: scaleX(1);
  }
  50% {
    transform: scaleX(0.82);
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
    transform: rotate(0deg);
  }
  20% {
    transform: rotate(16deg);
  }
  40% {
    transform: rotate(-6deg);
  }
}

@keyframes sgd-scribble {
  0%,
  100% {
    transform: rotate(0deg);
  }
  50% {
    transform: rotate(-8deg);
  }
}
</style>
