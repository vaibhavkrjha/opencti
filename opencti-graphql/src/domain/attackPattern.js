import { map } from 'ramda';
import uuid from 'uuid/v4';
import {
  deleteByID,
  loadByID,
  notify,
  now,
  paginate,
  takeTx
} from '../database/grakn';
import { BUS_TOPICS } from '../config/conf';

export const findAll = args => paginate('match $m isa AttackPattern', args);

export const findById = attackPatternId => loadByID(attackPatternId);

export const addAttackPattern = async (user, attackPattern) => {
  const wTx = await takeTx();
  const attackPatternIterator = await wTx.query(`insert $attackPattern isa AttackPattern 
    has type "attackPattern";
    $attackPattern has stix_id "attackPattern--${uuid()}";
    $attackPattern has stix_label "";
    $attackPattern has stix_label_lowercase "";
    $attackPattern has name "${attackPattern.name}";
    $attackPattern has description "${attackPattern.description}";
    $attackPattern has name_lowercase "${attackPattern.name.toLowerCase()}";
    $attackPattern has description_lowercase "${
      attackPattern.description ? attackPattern.description.toLowerCase() : ''
    }";
    $attackPattern has created ${now()};
    $attackPattern has modified ${now()};
    $attackPattern has revoked false;
    $attackPattern has created_at ${now()};
    $attackPattern has updated_at ${now()};
  `);
  const createAttackPattern = await attackPatternIterator.next();
  const createdAttackPatternId = await createAttackPattern
    .map()
    .get('attackPattern').id;

  if (attackPattern.createdByRef) {
    await wTx.query(`match $from id ${createdAttackPatternId};
         $to id ${attackPattern.createdByRef};
         insert (so: $from, creator: $to)
         isa created_by_ref;`);
  }

  if (attackPattern.markingDefinitions) {
    const createMarkingDefinition = markingDefinition =>
      wTx.query(
        `match $from id ${createdAttackPatternId}; $to id ${markingDefinition}; insert (so: $from, marking: $to) isa object_marking_refs;`
      );
    const markingDefinitionsPromises = map(
      createMarkingDefinition,
      attackPattern.markingDefinitions
    );
    await Promise.all(markingDefinitionsPromises);
  }

  if (attackPattern.killChainPhases) {
    const createKillChainPhase = killChainPhase =>
      wTx.query(
        `match $from id ${createdAttackPatternId}; $to id ${killChainPhase}; insert (phase_belonging: $from, kill_chain_phase: $to) isa kill_chain_phases;`
      );
    const killChainPhasesPromises = map(
      createKillChainPhase,
      attackPattern.killChainPhases
    );
    await Promise.all(killChainPhasesPromises);
  }

  await wTx.commit();

  return loadByID(createdAttackPatternId).then(created =>
    notify(BUS_TOPICS.AttackPattern.ADDED_TOPIC, created, user)
  );
};

export const attackPatternDelete = attackPatternId =>
  deleteByID(attackPatternId);