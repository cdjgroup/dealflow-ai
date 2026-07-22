#!/bin/bash
# manage-servers.sh - Server lifecycle management
#
# Prevents process proliferation by managing server lifecycle.
#
# Usage:
#   ./scripts/manage-servers.sh status
#   ./scripts/manage-servers.sh start
#   ./scripts/manage-servers.sh stop
#   ./scripts/manage-servers.sh restart
#   ./scripts/manage-servers.sh heal
#   ./scripts/manage-servers.sh cleanup

set -e

# Source shared framework library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_framework.sh"

cd "$FW_PROJECT_ROOT"

# Read configuration
BACKEND_PORT=$(fw_get_nested "stack.backend.port" "8000")
FRONTEND_PORT=$(fw_get_nested "stack.frontend.port" "3003")
BACKEND_START=$(fw_get_nested "stack.backend.start_command" "")
FRONTEND_START=$(fw_get_nested "stack.frontend.start_command" "")
BACKEND_HEALTH=$(fw_get_nested "stack.backend.health_endpoint" "/health")
FRONTEND_HEALTH=$(fw_get_nested "stack.frontend.health_endpoint" "/")

# Helper functions
check_port() {
    lsof -ti :"$1" >/dev/null 2>&1
}

get_pid_by_port() {
    lsof -ti :"$1" 2>/dev/null | head -1
}

test_server() {
    local port=$1
    local endpoint="$2"
    curl -s --connect-timeout 5 "http://localhost:${port}${endpoint}" >/dev/null 2>&1
}

kill_process() {
    local pid=$1
    if [ -n "$pid" ]; then
        kill -15 "$pid" 2>/dev/null || true
        sleep 2
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${FW_YELLOW}Graceful shutdown failed, forcing kill for PID $pid${FW_NC}"
            kill -9 "$pid" 2>/dev/null || true
        fi
    fi
}

# ================================================================
# Commands
# ================================================================

cmd_status() {
    echo ""
    echo "================================================================"
    echo "  Server Status"
    echo "================================================================"
    echo ""

    if [ -n "$BACKEND_PORT" ] && [ "$BACKEND_PORT" != "0" ]; then
        if check_port "$BACKEND_PORT"; then
            local pid; pid=$(get_pid_by_port "$BACKEND_PORT")
            if test_server "$BACKEND_PORT" "$BACKEND_HEALTH"; then
                echo -e "  Backend ($BACKEND_PORT):  ${FW_GREEN}Running (PID $pid) - Healthy${FW_NC}"
            else
                echo -e "  Backend ($BACKEND_PORT):  ${FW_YELLOW}Running (PID $pid) - Not responding${FW_NC}"
            fi
        else
            echo -e "  Backend ($BACKEND_PORT):  ${FW_RED}Not running${FW_NC}"
        fi
    fi

    if [ -n "$FRONTEND_PORT" ] && [ "$FRONTEND_PORT" != "0" ]; then
        if check_port "$FRONTEND_PORT"; then
            local pid; pid=$(get_pid_by_port "$FRONTEND_PORT")
            if test_server "$FRONTEND_PORT" "$FRONTEND_HEALTH"; then
                echo -e "  Frontend ($FRONTEND_PORT): ${FW_GREEN}Running (PID $pid) - Healthy${FW_NC}"
            else
                echo -e "  Frontend ($FRONTEND_PORT): ${FW_YELLOW}Running (PID $pid) - Not responding${FW_NC}"
            fi
        else
            echo -e "  Frontend ($FRONTEND_PORT): ${FW_RED}Not running${FW_NC}"
        fi
    fi

    echo ""
}

cmd_start() {
    echo "Starting servers..."

    # Start backend
    if [ -n "$BACKEND_START" ] && [ -n "$BACKEND_PORT" ]; then
        if check_port "$BACKEND_PORT"; then
            echo -e "${FW_YELLOW}Backend already running on port $BACKEND_PORT${FW_NC}"
        else
            echo "  Starting backend on port $BACKEND_PORT..."
            if [ -d "$FW_PROJECT_ROOT/backend" ]; then
                cd "$FW_PROJECT_ROOT/backend"
            fi
            nohup $BACKEND_START > /tmp/backend-$BACKEND_PORT.log 2>&1 &
            cd "$FW_PROJECT_ROOT"
            sleep 3
            if check_port "$BACKEND_PORT"; then
                echo -e "${FW_GREEN}Backend started${FW_NC}"
            else
                echo -e "${FW_RED}Backend failed to start (check /tmp/backend-$BACKEND_PORT.log)${FW_NC}"
            fi
        fi
    fi

    # Start frontend
    if [ -n "$FRONTEND_START" ] && [ -n "$FRONTEND_PORT" ]; then
        if check_port "$FRONTEND_PORT"; then
            echo -e "${FW_YELLOW}Frontend already running on port $FRONTEND_PORT${FW_NC}"
        else
            echo "  Starting frontend on port $FRONTEND_PORT..."
            if [ -d "$FW_PROJECT_ROOT/frontend" ]; then
                cd "$FW_PROJECT_ROOT/frontend"
            fi
            nohup $FRONTEND_START > /tmp/frontend-$FRONTEND_PORT.log 2>&1 &
            cd "$FW_PROJECT_ROOT"
            sleep 3
            if check_port "$FRONTEND_PORT"; then
                echo -e "${FW_GREEN}Frontend started${FW_NC}"
            else
                echo -e "${FW_RED}Frontend failed to start (check /tmp/frontend-$FRONTEND_PORT.log)${FW_NC}"
            fi
        fi
    fi
}

cmd_stop() {
    echo "Stopping servers..."

    if [ -n "$BACKEND_PORT" ] && check_port "$BACKEND_PORT"; then
        local pid; pid=$(get_pid_by_port "$BACKEND_PORT")
        echo "  Stopping backend (PID $pid)..."
        kill_process "$pid"
        echo -e "${FW_GREEN}Backend stopped${FW_NC}"
    fi

    if [ -n "$FRONTEND_PORT" ] && check_port "$FRONTEND_PORT"; then
        local pid; pid=$(get_pid_by_port "$FRONTEND_PORT")
        echo "  Stopping frontend (PID $pid)..."
        kill_process "$pid"
        echo -e "${FW_GREEN}Frontend stopped${FW_NC}"
    fi
}

cmd_restart() {
    cmd_stop
    sleep 2
    cmd_start
}

cmd_heal() {
    echo "Checking for zombie processes..."

    if [ -n "$BACKEND_PORT" ] && check_port "$BACKEND_PORT"; then
        if ! test_server "$BACKEND_PORT" "$BACKEND_HEALTH"; then
            echo -e "${FW_YELLOW}Backend is running but not responding - restarting...${FW_NC}"
            local pid; pid=$(get_pid_by_port "$BACKEND_PORT")
            kill_process "$pid"
            sleep 2
            if [ -n "$BACKEND_START" ]; then
                cd "$FW_PROJECT_ROOT/backend" 2>/dev/null || cd "$FW_PROJECT_ROOT"
                nohup $BACKEND_START > /tmp/backend-$BACKEND_PORT.log 2>&1 &
                cd "$FW_PROJECT_ROOT"
            fi
        fi
    fi

    if [ -n "$FRONTEND_PORT" ] && check_port "$FRONTEND_PORT"; then
        if ! test_server "$FRONTEND_PORT" "$FRONTEND_HEALTH"; then
            echo -e "${FW_YELLOW}Frontend is running but not responding - restarting...${FW_NC}"
            local pid; pid=$(get_pid_by_port "$FRONTEND_PORT")
            kill_process "$pid"
            sleep 2
            if [ -n "$FRONTEND_START" ]; then
                cd "$FW_PROJECT_ROOT/frontend" 2>/dev/null || cd "$FW_PROJECT_ROOT"
                nohup $FRONTEND_START > /tmp/frontend-$FRONTEND_PORT.log 2>&1 &
                cd "$FW_PROJECT_ROOT"
            fi
        fi
    fi

    cmd_status
}

cmd_cleanup() {
    echo "Emergency cleanup - killing all matching processes..."
    if [ -n "$BACKEND_PORT" ]; then
        lsof -ti :"$BACKEND_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PORT" ]; then
        lsof -ti :"$FRONTEND_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
    fi
    echo -e "${FW_GREEN}Cleanup complete${FW_NC}"
}

# ================================================================
# Main
# ================================================================

case "${1:-status}" in
    status) cmd_status ;;
    start) cmd_start ;;
    stop) cmd_stop ;;
    restart) cmd_restart ;;
    heal) cmd_heal ;;
    cleanup) cmd_cleanup ;;
    *)
        echo "Usage: $0 {status|start|stop|restart|heal|cleanup}"
        exit 1
        ;;
esac
