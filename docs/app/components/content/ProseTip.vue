<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<template>
  <EncodingsCallout kind="tip" :title="title"><slot mdc-unwrap="p" /></EncodingsCallout>
</template>
