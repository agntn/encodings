<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<template>
  <EncodingsCallout kind="caution" :title="title"><slot mdc-unwrap="p" /></EncodingsCallout>
</template>
