import { bindDeferredRpcOperation, defineRpcOperation } from '../transport/rpc/rpc-operation'
import { rpcResultVariant } from '../transport/rpc/rpc-operation-result-reader'
import { hostScreenUnreadReplySchema } from '../host-screen/host-screen-reply-schema'

// Mark read reports a refusal, so the Overview can say the desktop did not take it.
export const worktreeMarkReadWrite = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'worktree.set-read',
    method: 'worktree.set',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('read-written', hostScreenUnreadReplySchema)
  })
)
