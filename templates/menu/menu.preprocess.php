<?php

// add menu link content fields as keys in the item array
foreach ($vars['items'] as $key => $item) {
  if(isset($vars['items'][$key]['content']) && isset($vars['items'][$key]['content']['#menu_link_content'])) {
    $entity = $vars['items'][$key]['content']['#menu_link_content'];
    foreach($entity->getFields() as $name => $field) {
      if (substr($name, 0, 6) === 'field_' && isset($field[0])) {
        $new_key = substr($name, 6);
        $vars['items'][$key][$new_key] = $field[0]->getValue()['value'];
      }
    }
  }
}