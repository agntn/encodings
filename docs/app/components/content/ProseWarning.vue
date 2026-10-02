<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<template>
  <EncodingsCallout kind="warning" :title="title"><slot mdc-unwrap="p" /></EncodingsCallout>
</template>
