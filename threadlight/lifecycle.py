"""Finding lifecycle: detected > explained > assigned > remediated > verified > closed.

Transitions are strictly sequential. The rules encode the human-approval loop:
only a human assigns, remediation needs evidence, verification needs a passing
recheck, and closing needs a named human approver plus evidence. An AI actor
can never close a finding.
"""

STATES = ["detected", "explained", "assigned", "remediated", "verified", "closed"]
ACTORS = ("human", "ai", "system")


class LifecycleError(Exception):
    pass


class Finding(object):
    def __init__(self, finding_id, requirement=None):
        self.id = finding_id
        self.requirement = requirement
        self.state = "detected"
        self.evidence = []
        self.approver = None
        self.history = [{"state": "detected", "actor": "system"}]

    def next_state(self):
        i = STATES.index(self.state)
        return STATES[i + 1] if i + 1 < len(STATES) else None

    def advance(self, to, actor, approver=None, evidence=None, recheck_passed=False):
        if actor not in ACTORS:
            raise LifecycleError("Unknown actor %r." % actor)
        if to not in STATES:
            raise LifecycleError("Unknown state %r." % to)
        if to != self.next_state():
            raise LifecycleError("Cannot move from %s to %s; the next state is %s." % (self.state, to, self.next_state()))
        if to == "assigned" and actor != "human":
            raise LifecycleError("Only a human can assign a finding.")
        if to == "remediated" and not evidence:
            raise LifecycleError("Remediation needs evidence.")
        if to == "verified" and not recheck_passed:
            raise LifecycleError("Verification needs a passing recheck.")
        if to == "closed":
            if actor != "human":
                raise LifecycleError("AI cannot close this finding; a named human approver must close it.")
            if not approver:
                raise LifecycleError("Closing needs a named approver.")
            if not (evidence or self.evidence):
                raise LifecycleError("Closing needs evidence.")
        if evidence:
            self.evidence.extend(evidence)
        if to == "closed":
            self.approver = approver
        self.state = to
        self.history.append({"state": to, "actor": actor, "approver": approver})
        return self
